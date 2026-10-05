FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Temporary build-only auth configuration; production secrets are supplied by Railway.
RUN BETTER_AUTH_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64url"))')" BETTER_AUTH_URL=https://build.invalid npm run build

RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATABASE_PATH=/data/loti.sqlite
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/legacy ./legacy
COPY --from=builder /app/next.config.ts /app/tsconfig.json ./
EXPOSE 3000
CMD ["npm", "start"]
