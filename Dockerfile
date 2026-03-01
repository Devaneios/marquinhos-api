# ── Stage 1: builder ─────────────────────────────────────────────
# Build toolchain stays in this stage and never reaches the final image.
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

# ── Stage 2: runtime ─────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

RUN addgroup -S marquinhos && adduser -S marquinhos -G marquinhos

COPY package.json bun.lock* tsconfig.json ./

# Reuse pre-compiled node_modules — no build toolchain needed at runtime
COPY --from=builder /app/node_modules ./node_modules

# Copy source (Bun runs TypeScript natively)
COPY src/ ./src/

RUN mkdir -p /app/data && chown marquinhos:marquinhos /app/data

USER marquinhos

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD pgrep -f "bun" || exit 1

CMD ["bun", "src/index.ts"]
