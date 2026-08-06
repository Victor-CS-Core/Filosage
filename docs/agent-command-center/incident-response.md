# Incident response

For suspected unauthorized access, prompt injection, sensitive-data exposure, or unintended action:

1. Activate the command-center kill switch.
2. Disable `COMMAND_CENTER_ENABLED` if containment requires a deployment-level stop.
3. Preserve ticket, approval, audit, hosting, Firebase, and alert evidence.
4. Rotate affected credentials using the established production runbook.
5. Determine whether any external side effect occurred. Draft and approval records should always report false; draft API responses should also report `sent: false`.
6. Document affected records, time window, owner, containment, and recovery decision.
7. Restore only after the failed boundary has a regression test.

Do not paste private messages, secrets, legal material, or payment details into general-purpose incident channels.
