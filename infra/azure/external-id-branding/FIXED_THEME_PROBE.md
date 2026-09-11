# Fixed-theme assets for the hosted visual probe

These local assets prepare the visual probe in the [identity-safe rollout proposal](../../../docs/releases/2026-09-11-hosted-theme-identity-plan.md). They have not been uploaded or assigned to an Azure application. The existing `custom.css`, manifest, tenant branding and authentication configuration are unchanged.

| Candidate application theme | Exact CSS upload filename | Page / sign-in card |
| --- | --- | --- |
| Fixed light | `custom-light.css` | `#E7DDCE` / `#FFF9F0` |
| Fixed dark | `custom-dark.css` | `#000D23` / `#0D1B3D` |

Both files are in this directory. Upload only after the owner approves the candidate registrations and application-specific theme assignments in the proposal. These are separate theme files, not replacements for the default stylesheet. Existing reviewed logos, background images and legal links still need the corresponding portal assignment; CSS does not select those assets or change the sign-in client.

## Reproduce and check

From the repository root:

```powershell
node scripts/generate-hosted-theme-css.mjs
node scripts/generate-hosted-theme-css.mjs --check
$env:PLAYWRIGHT_EXTERNAL_SERVER = '1'
$env:PLAYWRIGHT_HTML_OPEN = 'never'
npx playwright test tests/external-id-branding.spec.ts --project=chromium --grep 'custom CSS' --reporter='line,html'
```

The focused test uses `page.setContent`; external-server mode starts no application server and makes no sign-in requests. Open its HTML report to inspect four opposite-OS screenshots at 1280px and 320px.

Derivation is deliberately small: canonicalize source line endings, prepend `:root { color-scheme: only light; }` or `only dark`, and replace the single dark-mode media condition with `not all` or `all`. The light file retains the inactive dark block so every original selector, declaration and cascade position stays intact. The dark file always applies that same reviewed navy block. Neither generated file contains a color-preference media query. The root declaration fixes native control appearance without disabling forced-colors behavior.

Each file records the canonical source SHA-256. The generator rejects unexpected additional color-preference conditions; `--check` rejects missing or stale derivatives. Do not hand-edit the generated files. After a reviewed `custom.css` change, regenerate and repeat the fixture and hosted checks.

## Local verification and hosted gate

The existing Chromium CSS fixture compares light and dark assets against their respective source appearance under both OS preferences at 1280px and 320px. It checks the surface, input/link/button focus, primary/secondary hover, font and texture rules, 44px controls, mobile corner radius, reduced motion and forced-colors system outlines/borders. A source reconstruction assertion also preserves every original rule and its order. Four screenshots were inspected: both fixed palettes remain consistent under the opposite OS preference, including narrow-width wrapping and visible focus rings.

This is a local selector fixture with a synthetic federation icon, not Microsoft's complete page layout or a hosted signup test. It cannot prove Azure accepts/serves the CSS, assigns the expected application theme, or preserves the chosen appearance through later sign-in steps. After approved admin setup, use the separate guest-browser visual probe from the proposal: inspect the served file, application selection, actual logo/background, email and signup-entry screens, keyboard focus, mobile layout and forced colors with opposite OS preferences. Stop before entering an email/code or creating an account. Identity enrollment and the original-client recovery limitation remain separate gates in the proposal.
