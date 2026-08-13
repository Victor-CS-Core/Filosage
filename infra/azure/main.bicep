@description('Short lowercase prefix used for globally unique Azure resource names.')
@minLength(4)
@maxLength(12)
param prefix string

@description('Azure region for the staging environment.')
param location string = resourceGroup().location

@description('Container image to deploy. Use the hello-world image for the infrastructure-only bootstrap.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Deploy the application after its immutable image exists in ACR.')
param deployApplication bool = true

@secure()
@description('PostgreSQL administrator password. Store the production value outside source control.')
param postgresAdminPassword string

param postgresAdminLogin string = 'filosageadmin'
param siteUrl string
param siteVersion string = 'bootstrap'
param entraClientId string = ''
param entraAuthority string = ''
param entraTenantId string = ''
param entraApiScope string = ''
param entraIssuer string = ''
param entraJwksUri string = ''
param ownerEmail string

@description('Object ID of the human deployment owner who must be able to rotate staging secrets.')
param deploymentPrincipalObjectId string

@secure()
param openAiApiKey string = ''

@secure()
param activityReceiptSecret string

@secure()
param entraDirectoryClientSecret string = ''

param entraDirectoryTenantId string = ''
param entraDirectoryClientId string = ''

param operationsAlertWebhookUrl string = ''

@secure()
param operationsAlertWebhookSecret string = ''

var unique = toLower(uniqueString(subscription().subscriptionId, resourceGroup().id, prefix))
var compactPrefix = take(replace(prefix, '-', ''), 10)
var registryName = take('${compactPrefix}${unique}acr', 50)
var storageName = take('${compactPrefix}${unique}st', 24)
var postgresName = take('${prefix}-${unique}-pg', 63)
var keyVaultName = take('${prefix}-${unique}-kv', 24)
var tags = {
  application: 'filosage'
  environment: 'staging'
  managedBy: 'bicep'
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: { name: 'PerGB2018' }
  }
}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${prefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.20.0.0/16'] }
    subnets: [
      {
        name: 'container-apps'
        properties: {
          addressPrefix: '10.20.0.0/23'
          delegations: [{
            name: 'container-apps-delegation'
            properties: { serviceName: 'Microsoft.App/environments' }
          }]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.20.2.0/28'
          delegations: [{
            name: 'postgres-delegation'
            properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
          }]
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource containerSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: network
  name: 'container-apps'
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: network
  name: 'postgres'
}

resource postgresPrivateDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${prefix}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresPrivateDns
  name: '${prefix}-postgres-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: network.id }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: postgresSubnet.id
      privateDnsZoneArmResourceId: postgresPrivateDns.id
      publicNetworkAccess: 'Disabled'
    }
    storage: {
      autoGrow: 'Enabled'
      storageSizeGB: 32
      tier: 'P4'
    }
  }
  dependsOn: [postgresDnsLink]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'filosage'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    policies: { quarantinePolicy: { status: 'disabled' } }
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 7 }
    containerDeleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

resource bannerContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'course-banners'
  properties: { publicAccess: 'None' }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-app-identity'
  location: location
  tags: tags
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    publicNetworkAccess: 'Enabled'
    softDeleteRetentionInDays: 30
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
  }
}

var databaseUrl = 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/filosage?sslmode=verify-full'

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: { value: databaseUrl }
}

resource postgresAdminPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'postgres-admin-password'
  properties: { value: postgresAdminPassword }
}

resource openAiSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(openAiApiKey)) {
  parent: vault
  name: 'openai-api-key'
  properties: { value: openAiApiKey }
}

resource receiptSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'activity-receipt-secret'
  properties: { value: activityReceiptSecret }
}

resource directorySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(entraDirectoryClientSecret)) {
  parent: vault
  name: 'entra-directory-client-secret'
  properties: { value: entraDirectoryClientSecret }
}

resource operationsAlertSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(operationsAlertWebhookSecret)) {
  parent: vault
  name: 'operations-alert-webhook-secret'
  properties: { value: operationsAlertWebhookSecret }
}

var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var blobContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var keyVaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
var keyVaultSecretsOfficerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, acrPullRoleId)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource blobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, identity.id, blobContributorRoleId)
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

resource deploymentOwnerSecretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, deploymentPrincipalObjectId, keyVaultSecretsOfficerRoleId)
  properties: {
    principalId: deploymentPrincipalObjectId
    principalType: 'User'
    roleDefinitionId: keyVaultSecretsOfficerRoleId
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${prefix}-environment'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: listKeys(logs.id, logs.apiVersion).primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: containerSubnet.id
      internal: false
    }
  }
}

var appSecrets = concat(
  [
    { name: 'database-url', keyVaultUrl: databaseUrlSecret.properties.secretUriWithVersion, identity: identity.id }
    { name: 'activity-receipt-secret', keyVaultUrl: receiptSecret.properties.secretUriWithVersion, identity: identity.id }
  ],
  !empty(openAiApiKey) ? [{ name: 'openai-api-key', keyVaultUrl: openAiSecret!.properties.secretUriWithVersion, identity: identity.id }] : [],
  !empty(entraDirectoryClientSecret) ? [{ name: 'entra-directory-client-secret', keyVaultUrl: directorySecret!.properties.secretUriWithVersion, identity: identity.id }] : [],
  !empty(operationsAlertWebhookSecret) ? [{ name: 'operations-alert-webhook-secret', keyVaultUrl: operationsAlertSecret!.properties.secretUriWithVersion, identity: identity.id }] : []
)

var appEnvironment = concat(
  [
    { name: 'NODE_ENV', value: 'production' }
    { name: 'DATABASE_URL', secretRef: 'database-url' }
    { name: 'DATABASE_SSL', value: 'verify-full' }
    { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
    { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
    { name: 'AZURE_STORAGE_BANNER_CONTAINER', value: bannerContainer.name }
    { name: 'AZURE_POSTGRES_SERVER_NAME', value: postgres.name }
    { name: 'AZURE_RESOURCE_GROUP', value: resourceGroup().name }
    { name: 'NEXT_PUBLIC_SITE_URL', value: siteUrl }
    { name: 'SITE_VERSION', value: siteVersion }
    { name: 'NEXT_PUBLIC_ENTRA_CLIENT_ID', value: entraClientId }
    { name: 'NEXT_PUBLIC_ENTRA_AUTHORITY', value: entraAuthority }
    { name: 'NEXT_PUBLIC_ENTRA_TENANT_ID', value: entraTenantId }
    { name: 'NEXT_PUBLIC_ENTRA_API_SCOPE', value: entraApiScope }
    { name: 'NEXT_PUBLIC_ENTRA_REDIRECT_URI', value: siteUrl }
    { name: 'ENTRA_AUDIENCE', value: entraClientId }
    { name: 'ENTRA_ISSUER', value: entraIssuer }
    { name: 'ENTRA_JWKS_URI', value: entraJwksUri }
    { name: 'ENTRA_DIRECTORY_TENANT_ID', value: entraDirectoryTenantId }
    { name: 'ENTRA_DIRECTORY_CLIENT_ID', value: entraDirectoryClientId }
    { name: 'OPERATIONS_ENVIRONMENT', value: 'azure-staging' }
    { name: 'OWNER_EMAIL', value: ownerEmail }
    { name: 'ACTIVITY_RECEIPT_SECRET', secretRef: 'activity-receipt-secret' }
    { name: 'BILLING_PROVIDER', value: 'stripe' }
    { name: 'BILLING_ENABLED', value: 'false' }
  ],
  !empty(entraDirectoryClientSecret) ? [{ name: 'ENTRA_DIRECTORY_CLIENT_SECRET', secretRef: 'entra-directory-client-secret' }] : [],
  !empty(operationsAlertWebhookUrl) ? [{ name: 'OPERATIONS_ALERT_WEBHOOK_URL', value: operationsAlertWebhookUrl }] : [],
  !empty(operationsAlertWebhookSecret) ? [{ name: 'OPERATIONS_ALERT_WEBHOOK_SECRET', secretRef: 'operations-alert-webhook-secret' }] : [],
  !empty(openAiApiKey) ? [{ name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }] : []
)

resource app 'Microsoft.App/containerApps@2025-01-01' = if (deployApplication) {
  name: '${prefix}-app'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [{ server: registry.properties.loginServer, identity: identity.id }]
      secrets: appSecrets
    }
    template: {
      containers: [{
        name: 'filosage'
        image: containerImage
        env: appEnvironment
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
        maxReplicas: 3
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '50' } } }]
      }
    }
  }
  dependsOn: [acrPull, blobContributor, vaultSecretsUser, database]
}

output containerAppName string = deployApplication ? app!.name : ''
output containerAppUrl string = deployApplication ? 'https://${app!.properties.configuration.ingress.fqdn}' : ''
output registryName string = registry.name
output storageAccountName string = storage.name
output postgresServerName string = postgres.name
output managedIdentityClientId string = identity.properties.clientId
output keyVaultName string = vault.name
