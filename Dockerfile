# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 2: Runtime image ───────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Add tini for proper signal handling (important for Docker)
RUN apk add --no-cache tini

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Do NOT copy .env — it will be supplied via docker-compose env_file / secrets
RUN rm -f .env

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
