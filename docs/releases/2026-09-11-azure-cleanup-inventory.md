# Azure cleanup inventory — 2026-09-11

> Historical September 11 recovery record, preserved during September 12 branch consolidation. Later evidence and instructions in [AGENT_PROGRESS.md](../AGENT_PROGRESS.md) supersede pending states and older tracker requirements here. This record grants no new operational authorization.

Observed: 2026-09-11T06:36:13+00:00. Read-only audit; no Azure resources deleted or modified.

## Scope and completeness

The logged-in Azure account lists one enabled accessible subscription: `Azure subscription 1` (`bfc8f890-2681-43dc-8eac-51644341ae12`). Explicit ARM GET pagination of `/resourcegroups` and `/resources` completed successfully: 4 groups and 42 resources, one page each, with no remaining `nextLink`. Failed requests were not interpreted as empty results. An initial sandbox logging failure was retried outside the sandbox. A combined dependency-read approval timed out; its individual reads subsequently succeeded.

This inventories ARM resources in the current accessible subscription. Provider child objects are not universally represented by the generic ARM list; the East US 2 watcher flow-log and connection-monitor lists were also checked directly. Entra app registrations/service principals, customer records, secret values, disk contents, storage contents, and resources outside the accessible subscription were not inventoried. No conclusion that those scopes are empty is implied.

## Classification and recommended scope

| Group | Resources | Classification | Recommendation |
|---|---:|---|---|
| `filosage-staging-central-rg` | 33 | Filosage and its supporting infrastructure | Preserve all |
| `ME_filosagestg-environment_filosage-staging-central-rg_centralus` | 2 | Azure-managed Filosage environment infrastructure | Preserve all |
| `kbot-m0-recovery-lab` | 6 | Confirmed other-project expired recovery lab | Eligible for authorized group cleanup; OS disk data loss |
| `NetworkWatcherRG` | 1 | Regional shared infrastructure, currently no configured monitoring jobs | Preserve in this conservative cleanup recommendation |

## Confirmed other-project cleanup candidate

Exact resource group ID: `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab`.

Confidence: **high** that this is unrelated to Filosage. The group and VM/OS disk are tagged `purpose=kbot-m0-crash-recovery` and `expires-on=2026-09-10`. It resides in `eastus2`; the Filosage deployment and its managed infrastructure reside in `centralus`. The conclusion also uses the dependency checks below, rather than names or region alone.

- VM `kbot-m0-crashlab` references only the lab OS disk and lab NIC; no data disks or managed identity are configured.
- Disk `kbot-m0-crashlab-osdisk` is managed by that VM.
- NIC `kbot-m0-crashlab-nic` references that VM, the lab NSG, and the lab VNet default subnet. It has no public-IP, load-balancer pool, or application-gateway pool references.
- NSG `kbot-m0-crashlab-nsg` references only that lab NIC and no subnets.
- VNet `kbot-m0-crashlab-vnet` has no peerings. Its sole subnet references only the lab NIC and has no private endpoints or route table.
- Schedule `shutdown-computevm-kbot-m0-crashlab` targets only that lab VM.
- No Filosage dependency on these resources was observed in the resource inventory and checked network/app relationships.

**Data-loss risk:** deleting this group destroys the VM and its managed OS disk, including any lab files, recovery fixtures, or results stored there. Contents and backups were not read or verified. Networking and the shutdown schedule are also removed. This is an identified destructive effect within the user-authorized other-project cleanup scope, not a claim that the disk contains no valuable data. Recheck the group membership immediately before deletion if other work has changed Azure since this snapshot.

### Exact candidate resource IDs

- `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.Network/virtualNetworks/kbot-m0-crashlab-vnet`
- `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.Network/networkSecurityGroups/kbot-m0-crashlab-nsg`
- `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.Network/networkInterfaces/kbot-m0-crashlab-nic`
- `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.Compute/virtualMachines/kbot-m0-crashlab`
- `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/KBOT-M0-RECOVERY-LAB/providers/Microsoft.Compute/disks/kbot-m0-crashlab-osdisk`
- `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.DevTestLab/schedules/shutdown-computevm-kbot-m0-crashlab`

## Regional shared resource retained

Exact ID: `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/NetworkWatcherRG/providers/Microsoft.Network/networkWatchers/NetworkWatcher_eastus2`.

`az network watcher flow-log list --location eastus2` and `az network watcher connection-monitor list --location eastus2` both returned successful empty arrays. The lab is the only inventoried workload in that region. However, the watcher has no project ownership tags and is regional infrastructure, so its creation/ownership by the lab is unproven. No customer or flow-log data was retrieved. Deleting it would remove regional network diagnostic capability/configuration; it is not recommended as a confirmed other-project resource in this audit.

## Filosage dependencies explicitly preserved

- Both `filosagestg-app` and `filosageqa-app` reference `filosagestg-environment`, their corresponding Filosage managed identities, and registry `filosagestp4ujucgnxq3gsacr.azurecr.io`.
- The environment references `filosagestg-vnet/subnets/container-apps`, uses Log Analytics, and names the `ME_filosagestg-environment_filosage-staging-central-rg_centralus` infrastructure group. Its load balancer and public IP carry `aca-managed-env-id` pointing back to the Filosage environment.
- Public `filosage.com` and `www.filosage.com` bindings reference `filosage-apex-managed` and `filosage-www-managed`; QA `qa.filosage.com` references `mc-filosagestg-en-qa-filosage-com-4745`. All are preserved.
- Preserve PostgreSQL `filosagestg-p4ujucgnxq3gs-pg`, vault `filosagestg-p4ujucgnxq3g`, storage `filosagestp4ujucgnxq3gss`, private PostgreSQL DNS/link, both customer directories, and all monitoring/action groups/alerts in the Filosage group. Their membership, names, tags, and approved protection list identify them as Filosage infrastructure; contents were not inspected.
- Preserve `NetworkWatcher_centralus` in the Filosage group despite its generic name. No auth app registrations or service principals are cleanup candidates.

## Complete ARM inventory

Exact IDs are listed below; Azure returns mixed case for some resource-group paths. Group classification uses case-insensitive comparisons.

### filosage-staging-central-rg

Group ID: `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg`.

| Resource type | Exact resource ID |
|---|---|
| `Microsoft.AzureActiveDirectory/ciamDirectories` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.AzureActiveDirectory/ciamDirectories/filosagecustomers` |
| `Microsoft.OperationalInsights/workspaces` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.OperationalInsights/workspaces/filosagestg-logs` |
| `Microsoft.ManagedIdentity/userAssignedIdentities` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/filosagestg-app-identity` |
| `Microsoft.Network/privateDnsZones` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Network/privateDnsZones/filosagestg.private.postgres.database.azure.com` |
| `Microsoft.ContainerRegistry/registries` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.ContainerRegistry/registries/filosagestp4ujucgnxq3gsacr` |
| `Microsoft.KeyVault/vaults` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.KeyVault/vaults/filosagestg-p4ujucgnxq3g` |
| `Microsoft.Storage/storageAccounts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Storage/storageAccounts/filosagestp4ujucgnxq3gss` |
| `Microsoft.Network/virtualNetworks` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Network/virtualNetworks/filosagestg-vnet` |
| `Microsoft.App/managedEnvironments` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.App/managedEnvironments/filosagestg-environment` |
| `Microsoft.Network/privateDnsZones/virtualNetworkLinks` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Network/privateDnsZones/filosagestg.private.postgres.database.azure.com/virtualNetworkLinks/filosagestg-postgres-link` |
| `Microsoft.DBforPostgreSQL/flexibleServers` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/filosagestg-p4ujucgnxq3gs-pg` |
| `Microsoft.App/containerApps` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.App/containerApps/filosagestg-app` |
| `Microsoft.App/managedEnvironments/managedCertificates` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.App/managedEnvironments/filosagestg-environment/managedCertificates/filosage-www-managed` |
| `Microsoft.App/managedEnvironments/managedCertificates` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.App/managedEnvironments/filosagestg-environment/managedCertificates/filosage-apex-managed` |
| `Microsoft.ManagedIdentity/userAssignedIdentities` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/filosageqa-app-identity` |
| `Microsoft.App/containerApps` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.App/containerApps/filosageqa-app` |
| `Microsoft.App/managedEnvironments/managedCertificates` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.App/managedEnvironments/filosagestg-environment/managedCertificates/mc-filosagestg-en-qa-filosage-com-4745` |
| `Microsoft.AzureActiveDirectory/ciamDirectories` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.AzureActiveDirectory/ciamDirectories/filosagecustomersprod` |
| `Microsoft.Insights/actiongroups` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/actiongroups/filosage-essential-ops-ag` |
| `Microsoft.Network/networkWatchers` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Network/networkWatchers/NetworkWatcher_centralus` |
| `Microsoft.Insights/activityLogAlerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/activityLogAlerts/filosage-rg-admin-failures` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-prod-http-5xx` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-db-storage-high` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-qa-http-5xx` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-prod-restarts` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-qa-high-cpu` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-db-unavailable` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-prod-high-cpu` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-qa-high-memory` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-qa-restarts` |
| `Microsoft.Insights/metricalerts` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/metricalerts/filosage-prod-high-memory` |
| `Microsoft.Insights/scheduledqueryrules` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/scheduledqueryrules/filosage-console-fatal-errors` |
| `Microsoft.Insights/scheduledqueryrules` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.Insights/scheduledqueryrules/filosage-platform-failures` |

### ME_filosagestg-environment_filosage-staging-central-rg_centralus

Group ID: `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/ME_filosagestg-environment_filosage-staging-central-rg_centralus`.

| Resource type | Exact resource ID |
|---|---|
| `Microsoft.Network/publicIPAddresses` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/ME_filosagestg-environment_filosage-staging-central-rg_centralus/providers/Microsoft.Network/publicIPAddresses/capp-svc-lb-ip` |
| `Microsoft.Network/loadBalancers` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/ME_filosagestg-environment_filosage-staging-central-rg_centralus/providers/Microsoft.Network/loadBalancers/capp-svc-lb` |

### kbot-m0-recovery-lab

Group ID: `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab`.

| Resource type | Exact resource ID |
|---|---|
| `Microsoft.Network/virtualNetworks` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.Network/virtualNetworks/kbot-m0-crashlab-vnet` |
| `Microsoft.Network/networkSecurityGroups` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.Network/networkSecurityGroups/kbot-m0-crashlab-nsg` |
| `Microsoft.Network/networkInterfaces` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.Network/networkInterfaces/kbot-m0-crashlab-nic` |
| `Microsoft.Compute/virtualMachines` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.Compute/virtualMachines/kbot-m0-crashlab` |
| `Microsoft.Compute/disks` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/KBOT-M0-RECOVERY-LAB/providers/Microsoft.Compute/disks/kbot-m0-crashlab-osdisk` |
| `Microsoft.DevTestLab/schedules` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/kbot-m0-recovery-lab/providers/Microsoft.DevTestLab/schedules/shutdown-computevm-kbot-m0-crashlab` |

### NetworkWatcherRG

Group ID: `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/NetworkWatcherRG`.

| Resource type | Exact resource ID |
|---|---|
| `Microsoft.Network/networkWatchers` | `/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/NetworkWatcherRG/providers/Microsoft.Network/networkWatchers/NetworkWatcher_eastus2` |

## Work state

Multica: unavailable in this session; no item fabricated. Local recovery key: `filosage-public-release-2026-09-11`. Owner: parent release agent; bounded inventory audit: desktop_review. Audit complete with the evidence above. User authorization for unrelated-resource deletion exists; execution belongs to the parent agent. No audit blocker remains.

Commit: none. Push: none. Deployment: none by this audit. Production verification: not performed by this audit. Azure deletion: none.
