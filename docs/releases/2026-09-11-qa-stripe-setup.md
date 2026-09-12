# Isolated QA Stripe TEST setup — September 11, 2026

> Historical September 11 recovery record, preserved during September 12 branch consolidation. Later evidence and instructions in [AGENT_PROGRESS.md](../AGENT_PROGRESS.md) supersede pending states and older tracker requirements here. This record grants no new operational authorization.

Status: dedicated TEST webhook and Portal created and read-back verified at approximately 06:26 UTC. Durable API-key binding, exact candidate deployment, and end-to-end QA lifecycle verification are separate parent-owned steps.

User approved isolated QA deployment and Stripe TEST integration. The existing QA canonical domain is `https://qa.filosage.com`; parent inspection confirmed its TLS binding, separate `database-url-qa` secret reference, and `qa-course-banners` storage. This preserves QA identity and supersedes the earlier proposed container-app FQDN. This worker has not called the QA endpoint or created test customers/payment events.

## Verified provider configuration

| Item | Result |
| --- | --- |
| Account | `acct_1TtgXPRANh4Mnfma`, TEST only; objects report `livemode=false` |
| Webhook | `we_1UENu8RANh4Mnfmav0d4Pf8k` |
| Endpoint | `https://qa.filosage.com/api/billing/webhook` |
| Event API version | `2026-07-29.dahlia`, matching installed SDK `apiVersion.js` |
| Portal | `bpc_1UENu8RANh4Mnfmafj0zDVuU`, named `Filosage QA TEST 2026-09-11` |
| Return URL | `https://qa.filosage.com/pricing`, matching application source |
| Plan/interval changes | Enabled, allowed update `price` only, `always_invoice`, unchanged billing anchor, no end-of-period scheduling conditions |
| Cancellation | Enabled at period end, cancellation reasons enabled, cancellation proration `none` |
| Recovery/history | Payment-method updates and invoice history enabled |
| Legal links | `https://qa.filosage.com/privacy` and `https://qa.filosage.com/terms` |
| Retry ownership | `metadata.filosage_setup=filosage-qa-2026-09-11`, stable object-specific idempotency keys |

Complete initial inventories contained no QA objects. The setup rerun reused the same IDs and verified the configuration without creating duplicates. Portal read-back requires `expand=features.subscription_update.products`; after the initial unexpanded response omitted products, an expanded retrieval and idempotent rerun verified the exact four-Price catalog.

The webhook subscribes to exactly these 15 events handled by current source:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
invoice.finalization_failed
invoice.payment_action_required
invoice.marked_uncollectible
invoice.voided
charge.refunded
charge.dispute.created
charge.dispute.closed
```

## QA catalog

| Environment variable | TEST Price | Product | Amount/interval |
| --- | --- | --- | --- |
| `STRIPE_PLUS_MONTHLY_PRICE_ID` | `price_1U3IHgRANh4Mnfma7uZ4ZK48` | `prod_V3P5lUmdV84hAD` | USD 9.99/month |
| `STRIPE_PLUS_ANNUAL_PRICE_ID` | `price_1U3IHgRANh4MnfmaokQtt2UU` | `prod_V3P5lUmdV84hAD` | USD 79.92/year |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_1U3ISmRANh4MnfmaXB43bIPd` | `prod_V3PHOuGhxqbr7z` | USD 14.99/month |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | `price_1U3ISnRANh4Mnfma2NQiLega` | `prod_V3PHOuGhxqbr7z` | USD 119.88/year |

All four are active recurring USD test Prices with interval count one and `tax_behavior=exclusive`, matching current offers. Both sandbox Products have `tax_code=null`; no classification was inferred or changed. Keep `STRIPE_TAX_READY=false`. The legacy `previous product Pro` Product, its Prices, the default Portal, and the `previous product.com` webhook were not targets of any mutation.

## Private handoff and durable key

The new signing secret was captured directly into `/tmp/filosage-qa-stripe-secrets.json` with mode `0600`. No secret was printed, logged, or stored in Git. Its keys are `STRIPE_WEBHOOK_SECRET`, `webhook_endpoint_id`, and `portal_configuration_id`; it contains no `STRIPE_SECRET_KEY`. Parent owns secure QA binding and temporary-file cleanup after successful verification.

A durable scoped TEST API key is required; no existing Stripe credential was found in the vault by the parent. CLI OAuth/session credentials were not exported or deployed. Official [restricted-key guidance](https://docs.stripe.com/keys/restricted-api-keys) uses the [TEST API-key Dashboard](https://dashboard.stripe.com/test/apikeys), including account verification where required. No documented durable-key creation CLI resource was found.

A local Foot window titled **Filosage QA Stripe key** was opened with `/tmp/filosage-qa-key-prompt.py`. It explains the Dashboard TEST context and key name `Filosage QA`, reads hidden input using `getpass`, rejects Live-key formats, and saves only a valid `rk_test_` (preferred) or `sk_test_` value to `/tmp/filosage-qa-api-key` with mode `0600`. The Dashboard URL was opened in the local browser. No entered key is passed in command arguments or copied into chat. Prompt launch is not evidence the key has been supplied or bound.

Source API needs: Customers, Subscriptions (including cancellation), Checkout Sessions (including expire), and Customer Portal sessions **write**; Prices, Products, Invoices, Charges, and Disputes **read**. Use equivalent Dashboard permissions and verify every QA flow with the restricted key. Application access does not require payouts, Live access, or provider-configuration administration.

## Remaining gates and operational state

- Parent must bind the durable test key and webhook signing secret only to isolated QA, with the new Portal ID and test Price IDs above.
- Preserve `NEXT_PUBLIC_SITE_URL=https://qa.filosage.com`, matching expected origin and authentication callbacks. Keep `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, `STRIPE_TAX_READY=false`, `BILLING_PROVIDER=stripe`.
- Verify exact candidate deployment, endpoint signatures, account binding, paid reconciliation, all Portal transitions, recovery, cancellation/deletion, and required message delivery before claiming integration readiness. Object configuration alone proves none of those journeys.

Multica unavailable: parent recovery key `filosage-public-release-2026-09-11` retained; no item or event fabricated. Owner: Codex worker for completed test configuration, parent for QA deployment/secret binding, user for secure Dashboard key creation. Status: configuration verified, integration pending. This worker made no Git commit/push or Azure deployment, created no customers/payments, sent no emails, and made no Live request or billing activation.
