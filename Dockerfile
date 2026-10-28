# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat tzdata
WORKDIR /app

# --- deps: install all dependencies (incl. dev, needed for the build)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# --- migrator: standalone Prisma CLI for `migrate deploy` at runtime
FROM base AS migrator
WORKDIR /opt/prisma
RUN npm init -y >/dev/null && npm install --no-audit --no-fund --omit=dev prisma@6.19.3

# --- build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# --- runtime
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PATH=/opt/prisma/node_modules/.bin:$PATH

RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
 && mkdir -p /data/uploads && chown -R app:app /data

COPY --from=migrator /opt/prisma /opt/prisma
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/prisma ./prisma
# The course templates: the app shows the "gather resources" prompt and example file from here.
COPY --from=build --chown=app:app /app/templates ./templates
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
