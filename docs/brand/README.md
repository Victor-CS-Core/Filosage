# Filosage brand system

Filosage is a calm, intelligent web learning product. The system uses navy structure, off-white reading space, and teal, blue, and coral as restrained signals for connection, focus, and progress.

## Source of truth

The authoritative source artwork is preserved byte-for-byte in [`art_src/brand`](../../art_src/brand): the supplied dark-theme and light-theme PNGs. `npm.cmd run brand:assets` deterministically crops their matching rounded tiles to equal 600 × 600 outputs without redrawing the gateway, spark, or center path. Product components switch between those raster assets by theme.

The runtime browser icon uses the lightweight Next.js App Router metadata file at `src/app/icon.svg`. Raster browser and Stripe exports remain available in the external brand library.

## Logo usage

- Keep clear space of at least one quarter of the rendered icon width on every side.
- Render the standalone icon at 24 px or larger. Use 32 px or larger in interactive navigation and 48 px or larger in external brand layouts.
- Render the horizontal lockup at 120 px wide or larger so the wordmark remains legible.
- Use `filosage-light-placement.svg` on light or off-white surfaces and `filosage-dark-placement.svg` on navy or dark surfaces.
- Use `filosage-social-avatar.svg` for square profile fields. Do not crop the original icon to make an avatar.
- The wordmark is a placement companion, not a modification of the original SVG.

### Incorrect usage

Do not recolor individual paths, remove the navy icon field, change proportions, add glow or shadow to the logo, place it on low-contrast imagery, rotate it, mask it, crop it, or substitute a generated approximation. Do not use the logo to imply a mobile application or app-store availability.

## Color palette

### Core

| Token | Value | Use |
| --- | --- | --- |
| Navy | `#0D1B3D` | Primary structure, dark fields, light-theme actions |
| Teal | `#14B8A6` | Progress and non-text brand signals |
| Blue | `#4DA6FF` | Connection and focus signals |
| Coral | `#FF8A65` | Small moments of emphasis |
| Off-white | `#FAFAF7` | Light canvas and readable inverse text |
| White | `#FFFFFF` | Raised light surfaces |

### Accessible UI derivatives

Use `#0F766E` for teal text/actions and `#1D4ED8` for blue text/focus on light surfaces. Use `#2DD4BF` and `#74B8FF` on dark surfaces. Semantic danger, warning, success, surfaces, borders, and text colors live in [`src/styles/brand/tokens.css`](../../src/styles/brand/tokens.css).

## Typography

Filosage uses Inter Variable for headings, interface text, and reading. Headings use 700 weight, balanced wrapping, and no tighter than `-0.04em` tracking. Body text remains at least 1 rem for long-form use and stays within roughly 65–70 characters per line.

## Gradients and patterns

Gradients are quiet atmospheric layers, never text fills or readability hazards. Keep pattern opacity low enough that body text retains WCAG 2.2 AA contrast. Use knowledge nodes for connection, learning paths for sequence, page motifs for learning context, and progress rings for demonstrated growth. Avoid combining more than one prominent pattern in a composition.

## Illustration style

Illustrations use precise geometric forms, fine paths, stable 4:3 canvases, and the exact Filosage palette. They explain relationships rather than depict AI characters or decorative mascots. Use one illustration per idea, keep adjacent HTML text editable, and mark redundant illustrations decorative with empty alt text.

## Photography guidance

Photography is optional. When it adds genuine context, use realistic editorial images of people learning or applying knowledge in natural settings. Avoid staged stock smiles, phones, app-store framing, robots, fabricated screens, or imagery that implies unsupported institutions or integrations. Crop to the final placement and ship responsive AVIF/WebP sizes rather than source-resolution originals.

## Accessibility

- Meet WCAG 2.2 AA contrast: 4.5:1 for normal text and 3:1 for large text.
- Preserve visible focus rings, semantic headings, landmarks, keyboard navigation, and 44 px practical touch targets.
- Do not communicate progress or status through color alone.
- Use meaningful alt text only when an image adds information; otherwise use `alt=""` and `aria-hidden="true"`.
- Keep primary landing-page copy as HTML. Text in campaign SVGs is limited to the external asset itself.
- Respect `prefers-reduced-motion` and avoid layout-dependent animation.
- Verify no horizontal overflow at 320 px.

## Asset inventory

Run `npm.cmd run brand:assets` after intentionally changing the generator. The generated `public/brand/asset-manifest.json` is the machine-readable inventory.

### Logo

| File | Dimensions | Recommended use |
| --- | ---: | --- |
| `public/brand/logo/filosage-theme-light.png` | 600 × 600 | Light-theme tile cropped from the supplied light-theme PNG |
| `public/brand/logo/filosage-theme-dark.png` | 600 × 600 | Dark-theme tile cropped from the supplied dark-theme PNG |
| `public/brand/logo/filosage-icon.png` | 513 × 523 | Application icon for browser, launcher, and app-tile placements |
| `public/brand/logo/browser-icon.png` | 513 × 523 | External browser-icon copy |
| `public/brand/logo/filosage-horizontal.svg` | 620 × 160 | Transparent horizontal lockup |
| `public/brand/logo/filosage-light-placement.svg` | 720 × 260 | Safe light-surface placement |
| `public/brand/logo/filosage-dark-placement.svg` | 720 × 260 | Safe dark-surface placement |
| `public/brand/logo/filosage-stripe-icon.png` | 512 × 512 | High-contrast square Stripe icon for mixed backgrounds; under 512 KB |
| `public/brand/logo/filosage-stripe-logo.png` | 800 × 200 | High-contrast Stripe wordmark plaque for mixed backgrounds; under 512 KB |
| `public/brand/logo/filosage-social-avatar.svg` | 1200 × 1200 | Square social avatar |

### Hero backgrounds and product resources

| File | Dimensions | Recommended use |
| --- | ---: | --- |
| `public/brand/backgrounds/hero-light.svg` | 1600 × 900 | Wide light hero background |
| `public/brand/backgrounds/hero-dark.svg` | 1600 × 900 | Wide dark hero background |
| `public/brand/backgrounds/hero-light-mobile.svg` | 900 × 1200 | Narrow light hero background |
| `public/brand/backgrounds/hero-dark-mobile.svg` | 900 × 1200 | Narrow dark hero background |
| `public/brand/illustrations/abstract-learning.svg` | 960 × 720 | General learning/comprehension visual |
| `public/brand/illustrations/desktop-product-frame.svg` | 1440 × 980 | Browser-based product frame for external compositions |

### Feature illustrations

All feature illustrations are 640 × 480 SVGs.

| File | Recommended use |
| --- | --- |
| `public/brand/illustrations/ai-explanations.svg` | Clear explanations |
| `public/brand/illustrations/personalized-practice.svg` | Personalized practice |
| `public/brand/illustrations/progress-tracking.svg` | Progress tracking |
| `public/brand/illustrations/learning-paths.svg` | Guided learning paths |
| `public/brand/illustrations/topic-exploration.svg` | Topic exploration |
| `public/brand/illustrations/concept-mastery.svg` | Demonstrated mastery |

### Website banners

| File | Dimensions | Recommended use |
| --- | ---: | --- |
| `public/brand/banners/main-website-banner.svg` | 1920 × 600 | Main website banner |
| `public/brand/banners/call-to-action-banner.svg` | 1600 × 500 | Call-to-action campaign banner |
| `public/brand/banners/about-page-banner.svg` | 1600 × 700 | About-page header |
| `public/brand/banners/blog-header.svg` | 1600 × 600 | Blog or notes header |
| `public/brand/banners/open-graph.svg` | 1200 × 630 | Editable Open Graph source |
| `public/brand/banners/social-sharing-fallback.svg` | 1200 × 630 | Editable social fallback source |
| `public/brand/social/open-graph.png` | 1200 × 630 | Runtime Open Graph and X metadata image |
| `public/brand/social/social-sharing-fallback.png` | 1200 × 630 | Raster social fallback |

### Social and external assets

| File | Dimensions | Recommended use |
| --- | ---: | --- |
| `public/brand/social/linkedin-company-banner.svg` | 1128 × 191 | LinkedIn company banner |
| `public/brand/social/x-profile-header.svg` | 1500 × 500 | X profile header |
| `public/brand/social/github-social-preview.svg` | 1280 × 640 | GitHub organization social preview |
| `public/brand/social/product-announcement.svg` | 1200 × 630 | Product announcement |
| `public/brand/social/launch-announcement.svg` | 1200 × 630 | Web launch announcement |
| `public/brand/social/newsletter-header.svg` | 1200 × 400 | Email/newsletter header |
| `public/brand/social/press-kit-cover.svg` | 1600 × 2000 | Press-kit cover |

### Patterns and icons

| File | Dimensions | Recommended use |
| --- | ---: | --- |
| `public/brand/patterns/dot-grid.svg` | 320 × 320 | Repeating neutral background |
| `public/brand/patterns/knowledge-nodes.svg` | 800 × 600 | Knowledge and connection motif |
| `public/brand/patterns/learning-path.svg` | 1200 × 400 | Wide sequential route |
| `public/brand/patterns/page-motif.svg` | 640 × 480 | Abstract book/page field |
| `public/brand/patterns/progress-rings.svg` | 640 × 640 | Progress and mastery motif |
| `public/brand/patterns/gradient-mesh.svg` | 1600 × 900 | Restrained teal-blue-coral mesh |
| `public/brand/icons/arrow-right.svg` | 48 × 48 | External brand compositions |
| `public/brand/icons/check.svg` | 48 × 48 | External brand compositions |
| `public/brand/icons/spark.svg` | 48 × 48 | External brand compositions |

Product UI continues to use the existing Lucide icon set for consistency. `public/brand/photography/README.md` contains sourcing guidance; no stock image ships by default.
