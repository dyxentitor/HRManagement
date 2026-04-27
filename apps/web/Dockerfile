# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace metadata first for better caching
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/

# Fetch and install for the web app only (workspace-aware)
RUN pnpm install --frozen-lockfile --filter @hrms/web

# Copy the rest of the web app and the contracts package (web depends on contracts in M1+)
COPY apps/web/ ./apps/web/
COPY packages/contracts/ ./packages/contracts/

WORKDIR /app/apps/web
RUN pnpm build

# --- Runtime ---
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Embedded SPA-fallback config (copied from apps/web/nginx-default.conf in the
# build context). Override at runtime by mounting deploy/nginx/default.conf onto
# /etc/nginx/conf.d/default.conf if you need the richer config with API
# reverse-proxy (used by docker-compose.prod.yml).
COPY apps/web/nginx-default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
