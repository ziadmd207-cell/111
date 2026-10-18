# ─────────────────────────────────────────────────────────────────────────────
#  ZEUS — Multi-stage Dockerfile
#  Stage 1 : Build React/Vite frontend  (node:20-alpine)
#  Stage 2 : Run FastAPI backend        (python:3.11-slim)
#            serves both /api/* and the built frontend on port 8000
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Frontend Build ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Install dependencies (layer-cached when package files don't change)
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# Copy source and build
COPY . .
RUN npm run build
# → output: /build/dist/


# ── Stage 2: Backend Runtime ──────────────────────────────────────────────────
FROM python:3.11-slim AS backend

# System deps required by psycopg2-binary and health-check curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Working directory inside the container = /app/server
# (matches the way uvicorn is called: python -m uvicorn app.main:app)
WORKDIR /app/server

# Install Python packages
COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy FastAPI application
COPY server/ ./

# Copy the compiled frontend into the location FastAPI expects: /app/dist
# (main.py resolves: os.path.join(__file__, "../../dist") → /app/dist)
COPY --from=frontend-builder /build/dist/ /app/dist/

# Uploads volume mount point
RUN mkdir -p /app/uploads

# Expose API / frontend port
EXPOSE 8000

# Health check (waits up to 20 s for startup)
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start uvicorn
CMD ["python", "-m", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
