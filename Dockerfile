FROM node:24-slim

ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY services/shared/package.json services/shared/
COPY services/${SERVICE}/package.json services/${SERVICE}/

RUN npm ci --omit=dev --no-audit --no-fund \
      --include-workspace-root \
      --workspace=services/shared \
      --workspace=services/${SERVICE}

COPY services/shared services/shared
COPY services/${SERVICE} services/${SERVICE}
COPY scripts scripts
COPY database database

WORKDIR /app/services/${SERVICE}
USER node
CMD ["node", "src/index.js"]
