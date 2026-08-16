# Filosage QA acceptance — 2026-08-14

## Release under test

- Environment: `https://qa.filosage.com`
- Git SHA: `55230f93fd82cedc276a8c83d9e8c274e4352e04`
- GitHub Actions run: `31784025670` (`Deploy isolated Azure QA #7`)
- Billing: disabled, as required for QA

## Automated release evidence

- Lint: passed
- TypeScript (`--noEmit --incremental false`): passed
- Production build: passed
- Full Playwright matrix: 838 passed, 29 intentionally skipped, 0 failed
- Independent deployed health/version check: passed at the exact full SHA

## Manual QA completed before authentication

- Desktop and 390 × 844 mobile checks on `/`, `/library`, `/standard`, `/pricing`, `/support`, `/privacy-center`, `/terms`, `/privacy`, `/acceptable-use`, and `/copyright`
- Light and dark theme switching and persistence
- QA isolated-data marker present
- No horizontal overflow on tested routes
- 320 × 568 narrow-phone landing and expanded navigation keep every visible control inside the viewport
- Public library empty state correctly reports zero published courses
- Paid checkout remains closed; Free, Plus, and Pro limits remain visible
- Support paper modal opens above page content, fits mobile, searches current help content, and resolves the Google sign-in article
- Sign-in dialog keeps Google continuation disabled until the user personally acknowledges the age/Terms/Privacy consent
- Response headers include nonce-based CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, and two-year HSTS with subdomains and preload
- `/api/health` reports the exact release SHA, expected QA origin, valid configuration, and healthy datastore
- Anonymous `/api/account` and `/api/generate-course` requests fail closed with `401`
- All four planned source packs pass the production course-request schema
- HTTP, credential-bearing, localhost, and raw-IP source links are rejected by the production schema

## Authenticated QA pending user sign-in

- Learner home and course-card pile in both themes
- Horizontal held-card movement, reversible pile cycling, and nearest-card snap
- Profile-triggered My Courses surface and draggable desktop positioning
- Support, Study tools, and Ask Filosage floating surfaces
- Course creation, generation, lesson generation, learning activities, review, progress, evidence, profile, and owner surfaces
- Four fresh cited courses and every generated lesson
- Visible reference attribution, exact deep links, unsafe-source rejection, and lesson-to-source assignment
- Final desktop/mobile/theme regression after any fixes

## Four generation briefs and link-only source packs

All notes below are original summaries for QA input. The source usage basis is `link-only`; no source text should be copied into the course prompt.

### 1. Systems thinking for public-health decisions

Goal: map a health-system intervention, identify feedback and unintended effects, and design an evaluation that tests system response.

Application: a public-health team deciding how to change an access program without shifting the problem elsewhere.

Sources:

1. **Systems Thinking for Health Systems Strengthening**
   - URL: `https://ahpsr.who.int/publications/i/item/2009-11-13-systems-thinking-for-health-systems-strengthening`
   - Author: Don de Savigny and Taghreed Adam (editors)
   - Publisher: World Health Organization, Alliance for Health Policy and Systems Research
   - Publication date: `2009-11-13`
   - Type: Official
   - Evidence note: Presents a practical systems-thinking approach that connects intervention design with evaluation and asks what works, for whom, and under which circumstances.
2. **CDC Program Evaluation Framework**
   - URL: `https://www.cdc.gov/evaluation/php/evaluation-framework/index.html`
   - Author: CDC Office of Policy, Performance, and Evaluation
   - Publisher: Centers for Disease Control and Prevention
   - Publication date: `2024-08-20`
   - Type: Official
   - Evidence note: Organizes evaluation around context, program description, focused questions, credible evidence, supported conclusions, and acting on findings, with relevance, rigor, transparency, ethics, and collaborative learning as explicit standards.

### 2. Evidence-led decision design and behavioural bias

Goal: diagnose a decision problem, surface behavioural assumptions, choose an ethical intervention, and define an evidence plan before implementation.

Application: a product or policy team deciding how to reduce friction without manipulating users or overstating evidence.

Sources:

1. **Tools and Ethics for Applied Behavioural Insights: The BASIC Toolkit**
   - URL: `https://www.oecd.org/en/publications/tools-and-ethics-for-applied-behavioural-insights-the-basic-toolkit_9ea76a8f-en.html`
   - Author: OECD
   - Publisher: OECD Publishing
   - Publication date: `2019-06-18`
   - Type: Official
   - Evidence note: Provides the BASIC process for analysing behaviour, building strategies, designing interventions, testing change, and screening choices for ethics, feasibility, and cost.
2. **Evidence-Based Policymaking: Practices to Help Manage and Assess the Results of Federal Efforts**
   - URL: `https://www.gao.gov/products/gao-23-105460`
   - Author: U.S. Government Accountability Office
   - Publisher: U.S. Government Accountability Office
   - Publication date: `2023-07-12`
   - Type: Official
   - Evidence note: Identifies practices for planning results, assessing and building evidence, using evidence in decisions, and maintaining a learning culture rather than treating data collection as the end goal.

### 3. Transparent evidence synthesis

Goal: frame an answerable review question, document search and selection, evaluate bias, and report what the evidence can and cannot support.

Application: a research team producing an auditable evidence brief for a professional decision.

Sources:

1. **Cochrane Handbook for Systematic Reviews of Interventions**
   - URL: `https://training.cochrane.org/handbook/current`
   - Author: Julian Higgins, James Thomas, and the Cochrane Handbook editorial team
   - Publisher: Cochrane
   - Publication date: `2024-08-22`
   - Type: Official
   - Evidence note: Defines a systematic review workflow spanning scope, eligibility, searching, study selection, data collection, bias assessment, synthesis, certainty, and interpretation.
2. **PRISMA 2020 statement**
   - URL: `https://www.prisma-statement.org/prisma-2020`
   - Author: PRISMA Executive
   - Publisher: PRISMA
   - Type: Official
   - Evidence note: Provides reporting checklists and flow diagrams that make identification, screening, inclusion, exclusion, limitations, and supporting materials traceable.

### 4. Communicating uncertainty in data

Goal: distinguish estimates from facts, explain uncertainty in plain language, choose an appropriate visual form, and prevent unsupported conclusions.

Application: an analyst presenting a changing metric to decision-makers and the public.

Sources:

1. **Communicating quality, uncertainty and change**
   - URL: `https://analysisfunction.civilservice.gov.uk/policy-store/communicating-quality-uncertainty-and-change/`
   - Author: Government Analysis Function
   - Publisher: UK Government Analysis Function
   - Type: Official
   - Evidence note: Recommends making critical limitations prominent, quantifying uncertainty when possible, giving context, explaining supported and unsupported conclusions, and using ranges, confidence intervals, annotations, texture, and colour carefully.
2. **NIST/SEMATECH Engineering Statistics Handbook, Chapter 2: Measurement Process Characterization**
   - URL: `https://www.nist.gov/publications/nistsematech-engineering-statistics-handbook-chapter-2-measurement-process`
   - Author: C. M. Croarkin
   - Publisher: National Institute of Standards and Technology
   - Publication date: `2003-06-01`
   - Type: Official
   - Evidence note: Covers repeatability, reproducibility, stability, calibration, measurement control, and uncertainty as distinct properties that affect how reported values should be interpreted.
