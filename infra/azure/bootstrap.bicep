@description('Separate manual bootstrap job. Deploying this resource does not execute it.')
param jobName string
param location string = resourceGroup().location
param environmentName string
param registryName string
param keyVaultName string
@description('Immutable image built from the Dockerfile bootstrap target, never the application target.')
param bootstrapImage string
param postgresAppLogin string = 'filosage_app'
param postgresAppDatabase string = 'filosage'

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' existing = { name: environmentName }
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = { name: registryName }
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = { name: keyVaultName }
resource adminSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = { parent: vault, name: 'database-admin-url' }
resource runtimePasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = { parent: vault, name: 'postgres-app-password' }
resource bootstrapIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = { name: '${jobName}-identity', location: location }
var keyVaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
resource adminAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: adminSecret
  name: guid(adminSecret.id, bootstrapIdentity.id, keyVaultSecretsUserRoleId)
  properties: { principalId: bootstrapIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: keyVaultSecretsUserRoleId }
}
resource passwordAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: runtimePasswordSecret
  name: guid(runtimePasswordSecret.id, bootstrapIdentity.id, keyVaultSecretsUserRoleId)
  properties: { principalId: bootstrapIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: keyVaultSecretsUserRoleId }
}
resource pullAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, bootstrapIdentity.id, acrPullRoleId)
  properties: { principalId: bootstrapIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: acrPullRoleId }
}
resource bootstrapJob 'Microsoft.App/jobs@2025-01-01' = {
  name: jobName
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${bootstrapIdentity.id}': {} } }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaRetryLimit: 0
      replicaTimeout: 600
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [{ server: registry.properties.loginServer, identity: bootstrapIdentity.id }]
      secrets: [
        { name: 'database-admin-url', keyVaultUrl: 'https://${vault.name}${environment().suffixes.keyvaultDns}/secrets/database-admin-url', identity: bootstrapIdentity.id }
        { name: 'postgres-app-password', keyVaultUrl: 'https://${vault.name}${environment().suffixes.keyvaultDns}/secrets/postgres-app-password', identity: bootstrapIdentity.id }
      ]
    }
    template: {
      containers: [{
        name: 'bootstrap'
        image: bootstrapImage
        env: [
          { name: 'DATABASE_BOOTSTRAP_AUTHORIZED', value: 'true' }
          { name: 'DATABASE_ADMIN_URL', secretRef: 'database-admin-url' }
          { name: 'POSTGRES_APP_PASSWORD', secretRef: 'postgres-app-password' }
          { name: 'POSTGRES_APP_LOGIN', value: postgresAppLogin }
          { name: 'POSTGRES_APP_DATABASE', value: postgresAppDatabase }
          { name: 'DATABASE_SSL', value: 'verify-full' }
        ]
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
      }]
    }
  }
  dependsOn: [adminAccess, passwordAccess, pullAccess]
}
output bootstrapJobId string = bootstrapJob.id
output bootstrapIdentityId string = bootstrapIdentity.id
