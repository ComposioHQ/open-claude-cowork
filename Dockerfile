# Open Claude Cowork — backend + web UI for Coolify
FROM node:20-alpine

# Security: add non-root user for running the app
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Server dependencies (cached layer — only re-runs when package files change)
COPY server/package.json server/package-lock.json ./server/

RUN cd server && npm ci --omit=dev

# Server source code
COPY server/ ./server/

# Web UI (served by Express)
COPY renderer/ ./renderer/

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

WORKDIR /app/server
ENV NODE_ENV=production

# Supabase (required for auth, persistence, storage)
ENV SUPABASE_URL=""
ENV SUPABASE_ANON_KEY=""
ENV SUPABASE_SERVICE_ROLE_KEY=""

# OpenAI (optional — enables vector search embeddings)
ENV OPENAI_API_KEY=""

# Production-safe default: disable anonymous access by default.
# Set ALLOW_ANONYMOUS=true only if you explicitly require anonymous mode.
ENV ALLOW_ANONYMOUS="false"

EXPOSE 3001

# Switch to non-root user
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://127.0.0.1:3001/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1));"

CMD ["node", "server.js"]
