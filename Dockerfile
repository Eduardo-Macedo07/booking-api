# syntax=docker/dockerfile:1

FROM node:26-alpine AS base
WORKDIR /app

# ---- dependências (camada em cache enquanto package*.json não mudar)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: gera o cliente Prisma, compila e remove as dependências de desenvolvimento
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- imagem final: só o necessário para rodar, sem root
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
# prisma/ e prisma.config.ts são necessários para `prisma migrate deploy` (rodado no deploy, antes de subir o app)
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/prisma.config.ts /app/package.json ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" >/dev/null || exit 1
CMD ["node", "dist/main"]
