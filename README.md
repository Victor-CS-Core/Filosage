# Teach

Teach is a premium AI-assisted learning product. Public visitors can discover published courses, read lessons, study diagrams, complete retrieval-practice quizzes, and keep device-local progress. A private owner studio creates, manages, publishes, and tutors courses.

## Product modes

- Public learning: open course discovery, published lessons, diagrams, quizzes, and local progress
- Private studio: Google SSO restricted to `viticopq12@gmail.com`
- Owner-only AI: course generation, lesson generation, and tutor chat are enforced on the server

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Firebase Authentication and Firestore
- OpenAI Responses API with Zod Structured Outputs
- Mermaid diagrams and Lucide icons
- CSS design tokens with light/dark themes and WCAG 2.2 AA targets

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the Firebase browser and Admin SDK values.
3. Add `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-5.6`.
4. Run `npm install` and then `npm run dev`.

Without local credentials, the public shell still renders for interface review, while data-backed and authenticated actions report that they are unavailable.

## Validation

```bash
npm run lint
npm run build
```

Deployment is intentionally separate from local validation. The current Sites build should be replaced only after the local redesign is approved.
