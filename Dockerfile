# Leuk — production container.
#
# Next 16 on a container rather than a managed Next.js host, and that choice is
# load-bearing (see docs/DEPLOY-AWS.md):
#   · Amplify Hosting supports Next 12–15 and does NOT support streaming. Every
#     AI surface here streams — /chat, the agent dock, Friday, and the MCP
#     server. It would deploy and hang.
#   · Cloudflare Workers has no filesystem, and eight routes read from disk.
#     Cloudflare also will not sign a BAA below Enterprise, and this app stores
#     PHI.
# Running `next start` ourselves makes framework-version support our problem
# instead of a platform's, which is exactly what we want with Next 16.
#
# Multi-stage, and the last stage is deliberately thin: `output: "standalone"`
# emits a self-contained server with only the modules actually imported, so the
# runtime image carries no npm tree and no build toolchain.

# ── deps ──────────────────────────────────────────────────────────────────────
# Debian slim, not Alpine: Next's image optimizer wants sharp, whose prebuilt
# binaries are glibc. musl means either a source build or silent degradation.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts=false

# ── build ─────────────────────────────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` prerenders the sitemap, which queries the directory. Without a
# database it silently falls back to the mock store and bakes fake URLs into a
# real sitemap — a build that "succeeds" and ships wrong data. The env file is
# mounted as a BuildKit secret so it is never a layer.
RUN --mount=type=secret,id=envlocal,target=/app/.env.local,required=false \
    npm run build

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Never root. The standalone server needs no write access to its own tree.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone emits the server and its traced dependencies; `static` and
# `public` are NOT included and have to come across by hand.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# assets/ holds the Operations PDFs the SignNow routes serve — a real product
# feature, 324 KB, so it ships.
#
# docs/ DELIBERATELY DOES NOT. Three routes read it, but all three are local
# developer tools (/workspace/docs and the Agents/Rules cards) now gated by
# lib/local-tools.ts, so they 404 here rather than 500. Shipping it would put
# 18 MB of handoff memos, recon reports, the Database Atlas and payer research
# inside a production image for a feature nobody in production can reach.
COPY --from=builder --chown=nextjs:nodejs /app/assets ./assets

# /api/files/download falls back to a local path when a file has no blob URL.
# Ephemeral in a container — real uploads go to blob storage — but the
# directory has to exist or the fallback throws instead of 404ing.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000

# The ALB health check hits this. `/api/health` would be better; the root is
# what exists today and it renders without a session.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
