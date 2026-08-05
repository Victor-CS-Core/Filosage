# Erudoza support wiki authoring

The public support wiki lives at `/support`. It is learner-facing documentation, not an operations manual. Owner authorization, security response, publication overrides, and internal release procedures remain in private repository documentation.

## Accuracy rule

Every factual statement must be traceable to current source code, current legal copy, or a verified runtime observation. Article files list the source paths used for their latest review. Do not infer availability from a hidden control, planned roadmap, API shape, or marketing intention.

Use cautious conditional language when behavior depends on a lesson, browser capability, authentication state, plan, quota, or hosted configuration. Never promise learning outcomes, response times, credentials, refunds, or future feature availability.

Paid checkout must be described as closed while `BILLING_ENABLED=false`. Joining a launch list or saving pricing intent must never be described as a purchase or subscription.

## Article structure

Articles are typed modules in `src/content/support/articles/`. Each article requires:

- a stable lowercase slug;
- a task-based title and concise summary;
- one category and useful search keywords;
- the date on which the claims were checked;
- the source paths used to check the claims;
- short Markdown sections with descriptive headings;
- valid related-article slugs.

Prefer the product's visible labels. Explain what the learner can do, what state to expect, and the safest recovery action. Do not expose internal identifiers, security controls, private course content, or owner-only procedures.

## Feature-change workflow

`docs/support/wiki-feature-map.json` maps learner-facing implementation paths to the articles they can affect. When a mapped feature changes:

1. Open each mapped article and compare every claim with the changed behavior.
2. Update the affected article and its `reviewedOn` date when public guidance changed.
3. If the public guidance did not change, record `Wiki impact: none` and a concrete `Wiki rationale:` in the pull-request description.
4. Run `npm.cmd run check:support-wiki` locally.
5. Run the impact check against the intended base when useful: `npm.cmd run check:support-wiki -- --base origin/main`.

The pull-request check blocks mapped application changes that have neither a corresponding article edit nor a meaningful no-impact rationale. A quarterly scheduled check blocks articles that have gone more than 180 days without review.

## Review checklist

- Follow every internal link.
- Test both public and signed-in presentation when the article links into the app.
- Verify mobile layout, keyboard order, headings, focus, contrast, and screen-reader names.
- Confirm that private/admin behavior is not disclosed.
- Confirm that conditional or unavailable features are not described as universal.
- Confirm the billing lock and privacy wording against their authoritative source files.
