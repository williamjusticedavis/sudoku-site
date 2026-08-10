# syntax=docker/dockerfile:1
# Multi-stage build for @sudoku/api. Build context is the REPO ROOT
# (docker compose / Render both set context to `.`), so the whole pnpm
# workspace is available.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
# OS-level deps for OCR + image preprocessing. This is the reason the api must
# deploy via Docker rather than Render's native runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr libvips \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- dev: used by docker compose; source is bind-mounted over /app at runtime,
#      node_modules preserved via anonymous volumes seeded from this image ----
FROM base AS dev
COPY . .
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@sudoku/api", "dev"]

# ---- build: install deps (api + @sudoku/db run via tsx; no compile step, so
#      cross-package TS source is loaded directly, matching @sudoku/engine) ----
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile

# ---- prod: runtime image for Render ----
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["pnpm", "start"]
