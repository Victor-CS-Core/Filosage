FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_COMMAND_CENTER_V2=false
ARG SITE_VERSION
ARG FLASHCARD_DECKS_ENABLED=false
ARG FLASHCARD_AI_GENERATION_ENABLED=false
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_COMMAND_CENTER_V2=$NEXT_PUBLIC_COMMAND_CENTER_V2
ENV SITE_VERSION=$SITE_VERSION
ENV FLASHCARD_DECKS_ENABLED=$FLASHCARD_DECKS_ENABLED
ENV FLASHCARD_AI_GENERATION_ENABLED=$FLASHCARD_AI_GENERATION_ENABLED
COPY . .
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ARG FLASHCARD_DECKS_ENABLED=false
ARG FLASHCARD_AI_GENERATION_ENABLED=false
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV FLASHCARD_DECKS_ENABLED=$FLASHCARD_DECKS_ENABLED
ENV FLASHCARD_AI_GENERATION_ENABLED=$FLASHCARD_AI_GENERATION_ENABLED
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-azure-database.ts ./scripts/migrate-azure-database.ts
COPY --from=builder --chown=nextjs:nodejs /app/scripts/import-azure-authored-courses.ts ./scripts/import-azure-authored-courses.ts
COPY --from=builder --chown=nextjs:nodejs /app/scripts/verify-azure-authored-courses.ts ./scripts/verify-azure-authored-courses.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/firestore-values.ts ./src/lib/firestore-values.ts
COPY --from=builder --chown=nextjs:nodejs /app/infra/azure/database ./infra/azure/database
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "node --experimental-strip-types scripts/migrate-azure-database.ts && exec node server.js"]
