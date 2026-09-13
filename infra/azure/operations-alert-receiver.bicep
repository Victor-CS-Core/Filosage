targetScope = 'resourceGroup'

@description('Exact immutable version of the separately approved operations-alert-hmac-v1 secret. No secret value is a deployment parameter.')
@minLength(32)
@maxLength(32)
param signingSecretVersion string

@description('Keep disabled during initial startup; enable only after healthy receiver logs are observed and notification tests are approved.')
param enableMonitoring bool = false

var location = 'centralus'
var receiverName = 'filosage-ops-alerts'
var receiverCode = '${loadTextContent('../../scripts/operations-alert-receiver.mjs')}\nawait startReceiver();\n'
var image = 'filosagestp4ujucgnxq3gsacr.azurecr.io/filosage@sha256:95cc9529e6abcfdef5918f39996cfed55703e5b29b82d75304a69765c844b344'
var tags = { purpose: 'signed-operations-alerts', owner: 'release-coordinator' }

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = { name: 'filosagestg-environment' }
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = { name: 'filosagestp4ujucgnxq3gsacr' }
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = { name: 'filosagestg-p4ujucgnxq3g' }
resource signingSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = { parent: vault, name: 'operations-alert-hmac-v1' }
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = { name: 'filosagestp4ujucgnxq3gss' }
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = { parent: storage, name: 'default' }
resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = { name: 'filosagestg-logs' }
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' existing = { name: 'filosage-essential-ops-ag' }
resource productionIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: 'filosagestg-app-identity' }

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'filosage-ops-alerts-identity'
  location: location
  tags: tags
}
resource receipts 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'operations-alerts'
  properties: { publicAccess: 'None' }
}
resource registryAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, 'operations-receiver-acr-pull')
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}
resource receiptAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(receipts.id, identity.id, 'operations-receiver-blob')
  scope: receipts
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  }
}
resource signingAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(signingSecret.id, identity.id, 'operations-receiver-signing')
  scope: signingSecret
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}
resource senderSigningAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(signingSecret.id, productionIdentity.id, 'operations-sender-signing')
  scope: signingSecret
  properties: {
    principalId: productionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}
resource receiver 'Microsoft.App/containerApps@2025-01-01' = {
  name: receiverName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 8080, transport: 'http', allowInsecure: false }
      registries: [{ server: registry.properties.loginServer, identity: identity.id }]
      secrets: [{ name: 'alert-signing', keyVaultUrl: '${vault.properties.vaultUri}secrets/operations-alert-hmac-v1/${signingSecretVersion}', identity: identity.id }]
    }
    template: {
      containers: [{
        name: 'signed-alert-receiver'
        image: image
        command: ['node']
        args: ['--input-type=module', '-e', receiverCode]
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: [
          { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
          { name: 'OPERATIONS_ALERT_WEBHOOK_SECRET', secretRef: 'alert-signing' }
          { name: 'ALERT_STORAGE_ACCOUNT_URL', value: 'https://${storage.name}.blob.${az.environment().suffixes.storage}' }
          { name: 'ALERT_STORAGE_CONTAINER', value: 'operations-alerts' }
        ]
        probes: [
          { type: 'Liveness', httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 30, periodSeconds: 30, timeoutSeconds: 6, failureThreshold: 3 }
          { type: 'Readiness', httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 5, periodSeconds: 10, timeoutSeconds: 6, failureThreshold: 3 }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
  dependsOn: [registryAccess, receiptAccess, signingAccess]
}

var receiverLogs = 'ContainerAppConsoleLogs_CL | where ContainerAppName_s == "${receiverName}" | extend alert = parse_json(Log_s) | where tostring(alert.component) == "operations-alert-receiver"'
var monitors = [
  {
    name: 'filosage-ops-alerts-events'
    severity: 1
    query: '${receiverLogs} | where tostring(alert.event) == "dependency-failed" or (tostring(alert.event) == "accepted" and tostring(alert.severity) in ("critical", "warning"))'
  }
  {
    name: 'filosage-ops-alerts-heartbeat'
    severity: 1
    query: '${receiverLogs} | summarize healthy=countif(tostring(alert.event) == "heartbeat") | where healthy == 0'
  }
]
resource monitoring 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = [for monitor in monitors: {
  name: monitor.name
  location: location
  tags: tags
  properties: {
    displayName: monitor.name
    enabled: enableMonitoring
    severity: monitor.severity
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [workspace.id]
    autoMitigate: true
    criteria: {
      allOf: [{
        query: monitor.query
        timeAggregation: 'Count'
        operator: 'GreaterThan'
        threshold: 0
        failingPeriods: { numberOfEvaluationPeriods: 1, minFailingPeriodsToAlert: 1 }
      }]
    }
    actions: { actionGroups: [actionGroup.id], customProperties: { Application: 'Filosage', Component: 'SignedAlertReceiver' } }
  }
}]

output receiverUrl string = 'https://${receiver.properties.configuration.ingress.fqdn}/alerts'
output receiverId string = receiver.id
output receiptContainerId string = receipts.id
output signingSecretVersionUrl string = '${vault.properties.vaultUri}secrets/operations-alert-hmac-v1/${signingSecretVersion}'
