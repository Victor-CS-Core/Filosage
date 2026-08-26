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

@secure()
@description('Least-privilege production database login. Never used by isolated QA.')
param postgresAppPassword string

param postgresAppLogin string = 'filosage_app'

@secure()
@description('Least-privilege QA database login. Stored so production bootstrap can create the role; QA never receives the production admin password.')
param postgresQaAppPassword string

param postgresQaAppLogin string = 'filosageqa_app'
param siteUrl string
param siteVersion string = 'bootstrap'
param googleClientId string = ''
param directGoogleAuthEnabled bool = true
param externalIdAuthEnabled bool = false
param externalIdNewAccountsEnabled bool = false
param externalIdClientId string = ''
param externalIdIssuer string = ''
param externalIdWellKnownConfiguration string = ''

@secure()
param googleClientSecret string = ''

@secure()
param externalIdClientSecret string = ''

@secure()
param identityLinkHmacSecret string = ''

param ownerEmail string

@secure()
@description('Migrated owner UID whose authored courses remain managed by the verified owner account.')
param migratedOwnerUid string = ''

@description('Object ID of the human deployment owner who must be able to rotate staging secrets.')
param deploymentPrincipalObjectId string

@secure()
param openAiApiKey string = ''

@secure()
param activityReceiptSecret string

param operationsAlertWebhookUrl string = ''

@secure()
param operationsAlertWebhookSecret string = ''

var unique = toLower(uniqueString(subscription().subscriptionId, resourceGroup().id, prefix))
var directGoogleConfigured = directGoogleAuthEnabled && !empty(googleClientId) && !empty(googleClientSecret)
var externalIdConfigurationComplete = !empty(externalIdClientId) && !empty(externalIdClientSecret) && !empty(externalIdIssuer) && !empty(externalIdWellKnownConfiguration)
var externalIdRuntimeEnabled = externalIdAuthEnabled && externalIdConfigurationComplete
var easyAuthConfigured = directGoogleConfigured || externalIdConfigurationComplete
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
    isVersioningEnabled: true
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

var databaseUrl = 'postgresql://${postgresAppLogin}:${uriComponent(postgresAppPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/filosage?sslmode=verify-full'
var databaseAdminUrl = 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/postgres?sslmode=verify-full'

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: { value: databaseUrl }
}

resource databaseAdminUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-admin-url'
  properties: { value: databaseAdminUrl }
}

resource postgresAppPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'postgres-app-password'
  properties: { value: postgresAppPassword }
}

resource postgresQaAppPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'postgres-qa-app-password'
  properties: { value: postgresQaAppPassword }
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

resource googleSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(googleClientSecret)) {
  parent: vault
  name: 'google-easy-auth-client-secret'
  properties: { value: googleClientSecret }
}

resource externalIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(externalIdClientSecret)) {
  parent: vault
  name: 'external-id-client-secret'
  properties: { value: externalIdClientSecret }
}

resource identityLinkSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(identityLinkHmacSecret)) {
  parent: vault
  name: 'identity-link-hmac-secret'
  properties: { value: identityLinkHmacSecret }
}

resource operationsAlertSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(operationsAlertWebhookSecret)) {
  parent: vault
  name: 'operations-alert-webhook-secret'
  properties: { value: operationsAlertWebhookSecret }
}

resource migratedOwnerUidSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(migratedOwnerUid)) {
  parent: vault
  name: 'migrated-owner-uid'
  properties: { value: migratedOwnerUid }
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
  scope: bannerContainer
  name: guid(bannerContainer.id, identity.id, blobContributorRoleId)
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
    { name: 'database-admin-url', keyVaultUrl: databaseAdminUrlSecret.properties.secretUriWithVersion, identity: identity.id }
    { name: 'postgres-app-password', keyVaultUrl: postgresAppPasswordSecret.properties.secretUriWithVersion, identity: identity.id }
    { name: 'postgres-qa-app-password', keyVaultUrl: postgresQaAppPasswordSecret.properties.secretUriWithVersion, identity: identity.id }
    { name: 'activity-receipt-secret', keyVaultUrl: receiptSecret.properties.secretUriWithVersion, identity: identity.id }
  ],
  !empty(openAiApiKey) ? [{ name: 'openai-api-key', keyVaultUrl: openAiSecret!.properties.secretUriWithVersion, identity: identity.id }] : [],
  !empty(googleClientSecret) ? [{ name: 'google-oauth-secret', keyVaultUrl: googleSecret!.properties.secretUriWithVersion, identity: identity.id }] : [],
  !empty(externalIdClientSecret) ? [{ name: 'external-id-oauth-secret', keyVaultUrl: externalIdSecret!.properties.secretUriWithVersion, identity: identity.id }] : [],
  !empty(identityLinkHmacSecret) ? [{ name: 'identity-link-hmac-secret', keyVaultUrl: identityLinkSecret!.properties.secretUriWithVersion, identity: identity.id }] : [],
  !empty(operationsAlertWebhookSecret) ? [{ name: 'operations-alert-webhook-secret', keyVaultUrl: operationsAlertSecret!.properties.secretUriWithVersion, identity: identity.id }] : [],
  !empty(migratedOwnerUid) ? [{ name: 'migrated-owner-uid', keyVaultUrl: migratedOwnerUidSecret!.properties.secretUriWithVersion, identity: identity.id }] : []
)

var appEnvironment = concat(
  [
    { name: 'NODE_ENV', value: 'production' }
    { name: 'DATABASE_URL', secretRef: 'database-url' }
    { name: 'DATABASE_ADMIN_URL', secretRef: 'database-admin-url' }
    { name: 'POSTGRES_APP_LOGIN', value: postgresAppLogin }
    { name: 'POSTGRES_APP_PASSWORD', secretRef: 'postgres-app-password' }
    { name: 'POSTGRES_APP_DATABASE', value: 'filosage' }
    { name: 'POSTGRES_QA_APP_LOGIN', value: postgresQaAppLogin }
    { name: 'POSTGRES_QA_APP_PASSWORD', secretRef: 'postgres-qa-app-password' }
    { name: 'POSTGRES_QA_APP_DATABASE', value: 'filosageqa' }
    { name: 'DATABASE_SSL', value: 'verify-full' }
    { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
    { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
    { name: 'AZURE_STORAGE_BANNER_CONTAINER', value: bannerContainer.name }
    { name: 'AZURE_POSTGRES_SERVER_NAME', value: postgres.name }
    { name: 'AZURE_RESOURCE_GROUP', value: resourceGroup().name }
    { name: 'NEXT_PUBLIC_SITE_URL', value: siteUrl }
    { name: 'SITE_VERSION', value: siteVersion }
    { name: 'AZURE_EASY_AUTH_ENABLED', value: string(easyAuthConfigured) }
    { name: 'DIRECT_GOOGLE_AUTH_ENABLED', value: string(directGoogleConfigured) }
    { name: 'EXTERNAL_ID_AUTH_ENABLED', value: string(externalIdRuntimeEnabled) }
    { name: 'EXTERNAL_ID_NEW_ACCOUNTS_ENABLED', value: string(externalIdRuntimeEnabled && externalIdNewAccountsEnabled) }
    { name: 'EXTERNAL_ID_CLIENT_ID', value: externalIdClientId }
    { name: 'EXTERNAL_ID_ISSUER', value: externalIdIssuer }
    { name: 'EXTERNAL_ID_WELL_KNOWN_CONFIGURATION', value: externalIdWellKnownConfiguration }
    { name: 'OPERATIONS_ENVIRONMENT', value: 'production' }
    { name: 'DEPLOYMENT_ENVIRONMENT', value: 'production' }
    { name: 'OWNER_EMAIL', value: ownerEmail }
    { name: 'ACTIVITY_RECEIPT_SECRET', secretRef: 'activity-receipt-secret' }
    { name: 'BILLING_PROVIDER', value: 'stripe' }
    { name: 'BILLING_ENABLED', value: 'false' }
    { name: 'BILLING_ROLLOUT_MODE', value: 'closed' }
    { name: 'STRIPE_TAX_READY', value: 'false' }
  ],
  !empty(operationsAlertWebhookUrl) ? [{ name: 'OPERATIONS_ALERT_WEBHOOK_URL', value: operationsAlertWebhookUrl }] : [],
  !empty(operationsAlertWebhookSecret) ? [{ name: 'OPERATIONS_ALERT_WEBHOOK_SECRET', secretRef: 'operations-alert-webhook-secret' }] : [],
  !empty(migratedOwnerUid) ? [{ name: 'MIGRATED_OWNER_UID', secretRef: 'migrated-owner-uid' }] : [],
  !empty(identityLinkHmacSecret) ? [{ name: 'IDENTITY_LINK_HMAC_SECRET', secretRef: 'identity-link-hmac-secret' }] : [],
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
        probes: [
          {
            type: 'Startup'
            httpGet: { path: '/api/health/startup', port: 3000, scheme: 'HTTP' }
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 10
            successThreshold: 1
          }
          {
            type: 'Liveness'
            httpGet: { path: '/api/health/live', port: 3000, scheme: 'HTTP' }
            initialDelaySeconds: 10
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
            successThreshold: 1
          }
          {
            type: 'Readiness'
            httpGet: { path: '/api/health/ready', port: 3000, scheme: 'HTTP' }
            initialDelaySeconds: 5
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 3
            successThreshold: 1
          }
        ]
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

var configuredIdentityProviders = union(
  directGoogleConfigured ? {
    google: {
      enabled: true
      registration: {
        clientId: googleClientId
        clientSecretSettingName: 'google-oauth-secret'
      }
      validation: { allowedAudiences: [googleClientId] }
    }
  } : {},
  externalIdConfigurationComplete ? {
    customOpenIdConnectProviders: {
      filosage: {
        enabled: externalIdRuntimeEnabled
        login: {
          nameClaimType: 'name'
          scopes: ['openid', 'profile', 'email']
        }
        registration: {
          clientId: externalIdClientId
          clientCredential: {
            clientSecretSettingName: 'external-id-oauth-secret'
            method: 'ClientSecretPost'
          }
          openIdConnectConfiguration: {
            wellKnownOpenIdConfiguration: externalIdWellKnownConfiguration
          }
        }
      }
    }
  } : {}
)

resource appAuth 'Microsoft.App/containerApps/authConfigs@2025-01-01' = if (deployApplication && easyAuthConfigured) {
  parent: app
  name: 'current'
  properties: {
    platform: { enabled: true }
    globalValidation: { unauthenticatedClientAction: 'AllowAnonymous' }
    httpSettings: { requireHttps: true }
    identityProviders: configuredIdentityProviders
    login: {
      preserveUrlFragmentsForLogins: true
      tokenStore: { enabled: false }
    }
  }
}

output containerAppName string = deployApplication ? app!.name : ''
output containerAppUrl string = deployApplication ? 'https://${app!.properties.configuration.ingress.fqdn}' : ''
output registryName string = registry.name
output storageAccountName string = storage.name
output postgresServerName string = postgres.name
output managedIdentityClientId string = identity.properties.clientId
output keyVaultName string = vault.name
