@description('Azure region containing the existing Filosage platform resources.')
param location string = resourceGroup().location

@description('Existing shared Azure Container Apps environment.')
param managedEnvironmentName string

@description('Existing Azure Container Registry.')
param registryName string

@description('Existing PostgreSQL Flexible Server.')
param postgresServerName string

@description('Existing storage account. QA receives a dedicated container.')
param storageAccountName string

@description('Existing Key Vault holding application secrets.')
param keyVaultName string

@description('Immutable application image already built from the candidate commit.')
param containerImage string

@description('Full Git SHA represented by the image.')
param siteVersion string

@description('Permanent QA origin.')
param siteUrl string = 'https://qa.filosage.com'

@description('Google OAuth web client ID shared with production. The secret remains in Key Vault.')
param googleClientId string

@description('Verified owner email retained in QA.')
param ownerEmail string

param postgresAdminLogin string = 'filosageadmin'

@secure()
@description('Existing PostgreSQL administrator password, used only to construct the isolated QA connection secret.')
param postgresAdminPassword string

@secure()
@description('Independent signing secret for QA learning-activity receipts.')
param activityReceiptSecret string

param qaAppName string = 'filosageqa-app'
param qaIdentityName string = 'filosageqa-app-identity'
param qaDatabaseName string = 'filosageqa'
param qaBannerContainerName string = 'qa-course-banners'

var tags = {
  application: 'filosage'
  environment: 'qa'
  managedBy: 'bicep'
  costProfile: 'scale-to-zero'
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: managedEnvironmentName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource qaDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: qaDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}

resource qaBannerContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: qaBannerContainerName
  properties: { publicAccess: 'None' }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

var qaDatabaseUrl = 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${qaDatabaseName}?sslmode=verify-full'

resource qaDatabaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url-qa'
  properties: { value: qaDatabaseUrl }
}

resource qaReceiptSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'activity-receipt-secret-qa'
  properties: { value: activityReceiptSecret }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: qaIdentityName
  location: location
  tags: tags
}

var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var blobContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var keyVaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, acrPullRoleId)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource qaBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: qaBannerContainer
  name: guid(qaBannerContainer.id, identity.id, blobContributorRoleId)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobContributorRoleId
  }
}

resource vaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, identity.id, keyVaultSecretsUserRoleId)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleId
  }
}

var vaultUri = vault.properties.vaultUri
var qaSecrets = [
  { name: 'database-url', keyVaultUrl: qaDatabaseUrlSecret.properties.secretUriWithVersion, identity: identity.id }
  { name: 'activity-receipt-secret', keyVaultUrl: qaReceiptSecret.properties.secretUriWithVersion, identity: identity.id }
  { name: 'openai-api-key', keyVaultUrl: '${vaultUri}secrets/openai-api-key', identity: identity.id }
  { name: 'google-oauth-secret', keyVaultUrl: '${vaultUri}secrets/google-easy-auth-client-secret', identity: identity.id }
  { name: 'migrated-owner-uid', keyVaultUrl: '${vaultUri}secrets/migrated-owner-uid', identity: identity.id }
]

var qaEnvironment = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'DATABASE_SSL', value: 'verify-full' }
  { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
  { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
  { name: 'AZURE_STORAGE_BANNER_CONTAINER', value: qaBannerContainer.name }
  { name: 'AZURE_POSTGRES_SERVER_NAME', value: postgres.name }
  { name: 'AZURE_RESOURCE_GROUP', value: resourceGroup().name }
  { name: 'NEXT_PUBLIC_SITE_URL', value: siteUrl }
  { name: 'SITE_VERSION', value: siteVersion }
  { name: 'DEPLOYMENT_ENVIRONMENT', value: 'qa' }
  { name: 'DEPLOYMENT_SLOT', value: 'qa' }
  { name: 'OPERATIONS_ENVIRONMENT', value: 'qa' }
  { name: 'AZURE_EASY_AUTH_ENABLED', value: 'true' }
  { name: 'OWNER_EMAIL', value: ownerEmail }
  { name: 'MIGRATED_OWNER_UID', secretRef: 'migrated-owner-uid' }
  { name: 'ACTIVITY_RECEIPT_SECRET', secretRef: 'activity-receipt-secret' }
  { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
  { name: 'BILLING_PROVIDER', value: 'stripe' }
  { name: 'BILLING_ENABLED', value: 'false' }
  { name: 'COMMAND_CENTER_DRAFTS_ENABLED', value: 'true' }
  { name: 'COMMAND_CENTER_ENABLED', value: 'true' }
  { name: 'COURSE_LABS_V2', value: 'true' }
  { name: 'COURSE_PIPELINE_SHADOW_MODE', value: 'false' }
  { name: 'COURSE_PIPELINE_V2', value: 'true' }
  { name: 'COURSE_PIPELINE_V2_COHORT_PERCENT', value: '0' }
  { name: 'COURSE_PIPELINE_V2_OWNER_ONLY', value: 'true' }
  { name: 'COURSE_PUBLICATION_V2', value: 'true' }
  { name: 'COURSE_REPAIR_V2', value: 'true' }
  { name: 'COURSE_VALIDATION_V2', value: 'true' }
  { name: 'COURSE_VISUALS_V2', value: 'true' }
  { name: 'LESSON_VISUALS_ENABLED', value: 'true' }
  { name: 'NEXT_TELEMETRY_DISABLED', value: '1' }
  { name: 'OPENAI_ASSESSMENT_MODEL', value: 'gpt-5.6-luna' }
  { name: 'OPENAI_COMMAND_CENTER_MODEL', value: 'gpt-5.6-terra' }
  { name: 'OPENAI_COURSE_MODEL', value: 'gpt-5.6-terra' }
  { name: 'OPENAI_COURSE_RECOVERY_MODEL', value: 'gpt-5.6-sol' }
  { name: 'OPENAI_LESSON_FALLBACK_MODEL', value: 'gpt-5.6-terra' }
  { name: 'OPENAI_LESSON_MODEL', value: 'gpt-5.6-luna' }
  { name: 'OPENAI_LESSON_RECOVERY_MODEL', value: 'gpt-5.6-sol' }
  { name: 'OPENAI_TUTOR_MODEL', value: 'gpt-5.6-luna' }
  { name: 'OPENAI_INPUT_COST_PER_MILLION', value: '2.5' }
  { name: 'OPENAI_OUTPUT_COST_PER_MILLION', value: '15' }
  { name: 'OPENAI_TUTOR_INPUT_COST_PER_MILLION', value: '1' }
  { name: 'OPENAI_TUTOR_OUTPUT_COST_PER_MILLION', value: '6' }
  { name: 'SUPPORT_EMAIL', value: 'support@filosage.com' }
]

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: qaAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      maxInactiveRevisions: 2
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [{ server: registry.properties.loginServer, identity: identity.id }]
      secrets: qaSecrets
    }
    template: {
      containers: [{
        name: 'filosage'
        image: containerImage
        env: qaEnvironment
        probes: [{
          type: 'Liveness'
          httpGet: { path: '/api/health', port: 3000, scheme: 'HTTP' }
          initialDelaySeconds: 30
          periodSeconds: 30
          timeoutSeconds: 5
          failureThreshold: 3
        }]
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '20' } } }]
      }
    }
  }
  dependsOn: [acrPull, qaBlobContributor, vaultSecretsUser, qaDatabase]
}

resource appAuth 'Microsoft.App/containerApps/authConfigs@2025-01-01' = {
  parent: app
  name: 'current'
  properties: {
    platform: { enabled: true }
    globalValidation: { unauthenticatedClientAction: 'AllowAnonymous' }
    httpSettings: { requireHttps: true }
    identityProviders: {
      google: {
        enabled: true
        registration: {
          clientId: googleClientId
          clientSecretSettingName: 'google-oauth-secret'
        }
        validation: { allowedAudiences: [googleClientId] }
      }
    }
    login: {
      preserveUrlFragmentsForLogins: true
      tokenStore: { enabled: false }
    }
  }
}

output qaAppName string = app.name
output qaDefaultUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output qaDatabaseName string = qaDatabase.name
output qaBannerContainerName string = qaBannerContainer.name
output qaIdentityClientId string = identity.properties.clientId
