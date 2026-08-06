# Operations

## Enable

1. Confirm the exact release and project tests.
2. Keep `BILLING_ENABLED=false`.
3. Run the complete live-model gate documented in `testing.md` against the exact model and prompt version in the release. Do not enable draft agents unless `productionGatePassed` is `true`.
4. Set `COMMAND_CENTER_ENABLED=true` in the approved environment.
5. To enable draft generation, separately set `COMMAND_CENTER_DRAFTS_ENABLED=true`, then enable only evaluated agents in Controls.
6. Deploy through the normal Sites release process.
7. Verify owner access, unauthorized rejection, agent flags, a review-only draft lifecycle, health, cost telemetry, and the hosted source version.

## Pause

Use Command Center → Controls to pause new intake or activate the kill switch. The environment flag is the outer production gate.

## Rollback

Set `COMMAND_CENTER_DRAFTS_ENABLED=false` to stop draft generation independently. Set `COMMAND_CENTER_ENABLED=false` and redeploy the last approved release if full rollback is necessary. Do not delete command-center collections during rollback; preserve them for audit and incident review. Existing learning, support wiki, privacy, reports, and billing-lock behavior remain independent.
