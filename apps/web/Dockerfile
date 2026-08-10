# syntax=docker/dockerfile:1
# Multi-stage build for @sudoku/web (TanStack Start). Build context is the REPO
# ROOT so the pnpm workspace (incl. @sudoku/engine) is available.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- dev: used by docker compose; source bind-mounted over /app at runtime ----
FROM base AS dev
COPY . .
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@sudoku/web", "dev"]

# ---- build: install + `vite build` (client + SSR handler) ----
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sudoku/web build

# ---- prod: runtime image for Render. server.mjs serves static assets + SSR
#      and listens on $PORT (Render) / 3000. ----
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.mjs"]
