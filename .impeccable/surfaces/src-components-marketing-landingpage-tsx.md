---
version: 1
slug: "src-components-marketing-landingpage-tsx"
primary_target: "src/components/marketing/LandingPage.tsx"
related_targets: ["src/components/marketing/MarketingHero.tsx","src/components/marketing/HowItWorks.tsx","src/components/marketing/PublicCourseProof.tsx","src/styles/brand/visitor-home.css"]
---

# Public landing page

- Scope and mode: public home; Persuade.
- Audience and job: people exploring a subject, personal project, study goal or work skill. Help them inspect a real course and decide whether to register.
- User decision, September 11, 2026: emphasize exploring a real course first. Only signed-in registered users can take published courses. Keep language and design plain, specific and free of generic AI marketing.
- Action and proof: Explore courses links directly to the public library in every loading, empty and error state. The featured outline uses actual public metadata and shared CourseBanner artwork.
- Composition: concise promise and course preview; three steps to start; practice/source/progress explanation; native FAQ disclosures; one closing exploration action.
- Style: preserve Filosage paper, oatmeal, navy, teal and coral; existing typography, logo and course artwork. Use rules and open spacing. No fabricated testimonials, scores, learner records or new raster assets.
- Access: public outlines never expose lesson bodies. Account entry retains the intended course or lesson through the existing verified identity and consent flow.
- Truth: source assignment is not claim verification; completed practice and assessed evidence stay distinct. Paid availability comes from the current pricing status, not a static promise.
- Responsive behavior: primary action in the first viewport at 320, 390 and 1280 widths; cover and outline stack on small screens; steps become a plain vertical list.
- Performance: render only public information while the session resolves. Preserve private loading gates. Dynamically load learner-only home code and conditional account dialogs.
- Motion: retain the restrained course entrance, disable it for reduced-motion preferences.

## Current validation

Local visitor/motion checks passed on Chromium, mobile Chromium and mobile WebKit. Both-theme WCAG-tagged axe scans, overflow, retry recovery and Escape/focus restoration checks passed. Root viewed desktop light and mobile dark screenshots. Optimized local measurements are recorded under docs/research/artifacts/visitor-release-2026-09-11; these are controlled laboratory results, not field Core Web Vitals. Remaining hosted release gates are tracked in docs/AGENT_PROGRESS.md. This redesign is not yet deployed.
