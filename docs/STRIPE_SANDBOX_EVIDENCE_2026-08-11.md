# Stripe sandbox evidence — August 11, 2026

> Historical record from 2026-08-11. Current production data deletion uses the Azure PostgreSQL document store. Retired document-store purge language below describes the environment at the time of the evidence, not current production.

Status: **core Stripe lifecycle and support/legal inbox delivery passed; Stripe lifecycle-email and full app-deletion evidence remain open**.

This record is intentionally redacted. It contains Stripe Test-mode object identifiers and observed states, but no card data, API keys, webhook signing secrets, hosted-session URLs, personal addresses, or secret environment values.

## Scope and controls

- Evidence label: `filosage-evidence-2026-08-11`
- Stripe account: `acct_1TtgXPRANh4Mnfma`
- Final API snapshot: `2026-08-11T16:41:36Z`
- Reviewer/operator: Victor Perez with Codex-assisted execution
- Every retained Stripe object reported `livemode=false`.
- Checkout used Stripe-hosted card collection. API-side simulations used Stripe's predefined Test-mode PaymentMethod aliases; no raw card value was accepted or retained.
- Production configuration was not changed and production checkout remained closed.

## Results

| Scenario | Result | Retained evidence |
| --- | --- | --- |
| Hosted Checkout | Pass | Session `cs_test_a1IHu3oGxNpk4xYsgvWvXTF5vxIVgtRDUnLaEg6mQ0HsiIz2iEJCSmiYi3` completed with `payment_status=paid`; subscription `sub_1U3IKCRANh4MnfmaUQORkrD8` became active; invoice `in_1U3IKARANh4MnfmaCjQnwvrI` was paid. |
| Monthly renewal | Pass | Test Clock `clock_1U3IHgRANh4Mnfmal1N7VEkf`; subscription `sub_1U3ILJRANh4MnfmafvkeEenf`; initial invoice `in_1U3ILJRANh4MnfmarIPFJH2Y` and cycle invoice `in_1U3ILwRANh4MnfmaaFCSgZpi` both paid at $9.99. The subscription later reached `canceled` after its scheduled end. |
| Annual renewal | Pass | Test Clock `clock_1U3IHhRANh4MnfmaGRw9RVl9`; subscription `sub_1U3ILORANh4MnfmaFIonAOnx`; initial invoice `in_1U3ILORANh4Mnfma1Bf6gEcj` and cycle invoice `in_1U3ILzRANh4MnfmayIwtk8uL` both paid at $79.92; final snapshot remained active. |
| Customer-portal cancellation | Pass | Portal subscription `sub_1U3IeQRANh4Mnfmaibi52yDr` remained active with future `cancel_at=1789144542`, `cancellation_reason=cancellation_requested`, and a portal action to undo cancellation. This preserves access until the scheduled end. |
| Failed-payment recovery | Pass, with a later deliberate failure left open | Subscription `sub_1U3INIRANh4Mnfmaymo3dqWY` moved to `past_due` after invoice `in_1U3IOhRANh4Mnfma2lgmQxYf` failed, then returned to active after a valid replacement PaymentMethod and invoice payment. A second deliberate failure, invoice `in_1U3IdRRANh4Mnfma6Mb5IQUK`, was left open with $9.99 remaining to test failure email delivery; the final subscription snapshot is therefore `past_due`. |
| Full refund | Pass | Refund `re_3U3IKARANh4Mnfma0M85fS1f` succeeded for $9.99 against the Checkout charge. A second $1.23 email-specific refund `re_3U3IcoRANh4Mnfma0TdECeMq` also succeeded. |
| Dispute | Pass | Dispute `du_1U3IQ5RANh4MnfmafFIBYrIY` opened as `needs_response`, accepted `winning_evidence`, moved through review, and ended `won` for $9.99. |
| Stripe-side account deletion cleanup | Pass | Active subscription `sub_1U3IQvRANh4MnfmaaW2RusOh` was canceled and customer `cus_V3PFKlPQJXpVcr` was deleted; later retrieval returned `deleted=true`. |
| Full Filosage account deletion | Partial | The remote Stripe cleanup was proven. This run did not delete a real signed-in Filosage account and therefore did not independently prove the PostgreSQL purge, deletion-lock race handling, or user-facing 409 recovery paths. Those remain covered only by automated application tests. |
| Webhook forwarding | Pass for bound terminal events | Stripe CLI forwarded real Test-mode events `evt_1U3IXsRANh4Mnfma7beJ6CZg` (`invoice.paid`) and `evt_1U3IYdRANh4MnfmaQ5VRhjsl` (`invoice.voided`) to the local `/api/billing/webhook`; both returned HTTP 200. |
| Exact webhook replay | Pass | The exact signed payload for `evt_1U3IQzRANh4Mnfma0iNGh0C8` (`customer.subscription.deleted`) returned HTTP 200 on first delivery and HTTP 200 with `duplicate=true` on replay. |
| Unmatched-event behavior | Expected fail-closed, operational follow-up required | Forwarding later nonterminal sandbox events for customers not bound to a Filosage account produced HTTP 500 responses. This is the intended fail-closed disposition, but it also means an all-events local listener can create retry/alert noise during manual simulations. |

## Customer email configuration and delivery

The Stripe Dashboard was saved with these customer-email settings enabled:

- successful-payment receipts;
- refund receipts;
- upcoming-renewal notices;
- expiring-card notices;
- card-payment-failure notices;
- Stripe-hosted payment-method update links;
- customer-portal subscription-management links.

Trial-ending and bank-debit failure messages remain disabled because the closed launch has no trial and permits cards only.

Delivery result at the evidence cutoff:

- An older Test-mode Filosage receipt from August 10 is present in `viticopq12@gmail.com`, proving the account can receive at least one Stripe Test receipt.
- No new message was found for the August 11 $1.23 successful payment/refund, seven-day annual-renewal trigger, deliberate card-payment failure, or portal cancellation.
- This run therefore **does not pass** the required receipt, renewal, failed-payment, refund, and cancellation email-delivery gate. Dashboard configuration is not delivery evidence.

## Support and legal inbox monitoring

At approximately 12:30 EDT, Gmail successfully sent uniquely titled test messages to:

- `support@filosage.com`
- `legal@filosage.com`

The owner later supplied receiving-side screenshots for both uniquely titled messages. Each screenshot shows the expected subject, evidence-run identifier, 12:30 PM timestamp, and its intended Filosage recipient. The screenshots were reviewed on August 11, 2026.

The send-and-receive requirement for `support@filosage.com` and `legal@filosage.com` is therefore **passed by owner-confirmed receiving-side evidence**. This does not prove response-time coverage, escalation handling, bounce/suppression behavior, or delivery of Stripe-generated lifecycle messages.

## Security and hygiene note

One early API attempt to create a PaymentMethod from raw Test card fields was rejected by Stripe, and Stripe delivered a Test-mode security warning. The attempt was stopped immediately; all subsequent API simulations used Stripe's predefined Test PaymentMethod aliases. No raw card value appears in this record or the repository.

The temporary Test secret and webhook signing secret were used only for this local evidence run and must be removed with the temporary processes and logs. Rotating the Test-mode secret after this run is recommended credential hygiene; the Live secret was not used.

## Launch interpretation

This evidence materially closes the Stripe-side Checkout, renewal, cancellation, recovery, refund, dispute, remote cleanup, and replay scenarios requested for this run. It does **not** close the entire paid-launch matrix because:

1. new lifecycle-email delivery was not observed;
2. a real signed-in Filosage account deletion was not executed;
3. plan-entitlement coverage for every Plus/Pro monthly/annual Checkout combination was not rerun here;
4. unrelated operational gates in the commercial launch runbook remain independent requirements.

Do not enable `BILLING_ENABLED=true` on the basis of this record alone.
