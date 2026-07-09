# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests for all workspaces
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all deps (including dev, for building)
RUN npm ci

# Copy source
COPY server/ ./server/
COPY client/ ./client/

# Build React frontend
RUN npm run build --workspace=client

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Only copy what production needs
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Install production-only server deps
RUN npm ci --workspace=server --omit=dev && npm cache clean --force

# Ensure logs directory exists
RUN mkdir -p ./server/logs

# Non-root user for security
RUN addgroup -S testforge && adduser -S testforge -G testforge
RUN chown -R testforge:testforge /app
USER testforge

EXPOSE 3010

ENV NODE_ENV=production
ENV PORT=3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3010/health || exit 1

CMD ["node", "server/server.js"]
