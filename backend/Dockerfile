# lexOS backend — production image (multi-stage).
# Build: docker build -t lexos-backend ./backend
# Run:   docker run --env-file backend/.env -p 3001:3001 lexos-backend

FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Optional: LibreOffice enables .doc/.docx → .pdf conversion. Uncomment to
# include it (adds ~400MB); without it, conversion-dependent features degrade.
# RUN apt-get update \
#   && apt-get install -y --no-install-recommends libreoffice-core libreoffice-writer \
#   && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3001
USER node
# The app exposes GET /health for container/load-balancer health checks.
CMD ["node", "dist/index.js"]
