# Request attribution and durable limits

Authenticated routes supply the verified account UID to the durable limiter.
Changing request forwarding headers does not change that account allowance.
Every namespace also has a global ceiling, shared across application replicas;
failure to update the datastore returns 503 before protected work proceeds.

The current Azure ingress boundary has not been read back or tested from this
implementation environment. Production therefore ignores `cf-connecting-ip`,
`x-forwarded-for`, `x-real-ip`, `forwarded` and similar client-address headers.
Anonymous requests share an unattributed bucket. This can throttle unrelated
anonymous visitors during a burst; it does not establish per-client fairness.
Nonproduction `x-real-ip` support exists for isolated test fixtures only.

A future per-client adapter requires evidence that the platform removes client
supplied attribution on every ingress path, that direct ingress cannot bypass
that platform, and that two independent clients receive distinct stable values.
Do not configure a trusted header merely because its name looks platform owned.
Hosted spoofing, independent-client and replica tests remain release evidence
gates. Local tests execute the actual limiter with a serialized substituted
transaction store; they do not prove PostgreSQL or Azure behavior.

Current verified-account allowances are:

| Work | Allowance per account | Window |
| --- | ---: | --- |
| Full account export | 3 | 1 hour |
| Account deletion attempt/resume | 10 | 10 minutes |
| Legal acceptance | 20 | 1 minute |
| Profile update | 30 | 1 minute |
| Learning plan update | 30 | 1 minute |
| Mastery evidence write | 120 | 1 minute |

Existing interaction, activity, support, checkout and public mutation allowances
remain in their route namespaces. Global allowances are 40 times each account
allowance for admitted work. Rejected attempts consume neither another account's
global allowance nor a new caller allowance. Responses include `Retry-After` and
do not cache rejection responses.
Deletion retries that hit the allowance retain their durable recovery state.
