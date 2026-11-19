# Deploy

A API é uma imagem Docker única e sem estado. Tudo que muda entre ambientes é variável de ambiente.

## Variáveis

Só `DATABASE_URL` e `JWT_SECRET` são obrigatórias; as demais têm padrão seguro. A lista completa, com
comentários, está em [`.env.example`](../.env.example), e a validação em `src/config/env.ts` (a app **não sobe**
com valor inválido).

| Variável         | Em produção                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`   | URL do PostgreSQL (use SSL se o provedor exigir: `?sslmode=require`)      |
| `JWT_SECRET`     | Segredo próprio e aleatório: `openssl rand -base64 48`. Nunca versione.   |
| `NODE_ENV`       | `production` (logs em JSON)                                              |
| `TRUST_PROXY`    | `true` atrás de proxy reverso, para o rate limit enxergar o IP real       |
| `CORS_ORIGINS`   | Origens do front-end, separadas por vírgula                              |
| `SWAGGER_ENABLED`| `false` se não quiser expor `/docs` publicamente                          |

## Migrations

As migrations são SQL versionado em `prisma/migrations`. Em qualquer ambiente:

```bash
npx prisma migrate deploy      # aplica o que falta; nunca cria nem apaga nada além das migrations
```

A imagem inclui a CLI do Prisma justamente para isso. No Docker Compose, o serviço `migrate` roda uma vez e a
API só sobe depois que ele termina com sucesso.

Para criar uma migration nova (desenvolvimento): altere `prisma/schema.prisma` e rode
`npm run db:migrate -- --name descricao`. Para constraints que o Prisma não expressa, use `--create-only`,
edite o SQL gerado e aplique em seguida (veja a ADR 0003).

## Render (blueprint incluído)

O arquivo [`render.yaml`](../render.yaml) descreve o banco e a API.

1. Faça push do repositório para o GitHub.
2. No Render: **New → Blueprint**, escolha o repositório. Ele cria o PostgreSQL e o serviço web a partir do
   `Dockerfile`, gera um `JWT_SECRET` aleatório e liga `DATABASE_URL` ao banco.
3. O comando de inicialização aplica as migrations e sobe a API; o health check é `/health/ready`.
4. `autoDeploy: true`: cada push em `main` publica uma nova versão (**deploy contínuo**). Para exigir que o CI
   passe antes, ative em *Settings → Build & Deploy* a opção de aguardar os checks do GitHub.
5. Crie o primeiro administrador, no *Shell* do serviço:

   ```bash
   ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='uma-senha-forte-e-unica' node dist/seed.js
   ```

> Confira no site do Render os planos e limites vigentes (instâncias gratuitas dormem por inatividade e bancos
> gratuitos podem expirar). Para um projeto em uso real, escolha planos pagos.

## Outras plataformas

A imagem funciona em qualquer lugar que rode contêineres (Fly.io, Railway, Cloud Run, ECS, Kubernetes…). O CI
publica no GitHub Container Registry a cada push em `main`:

```bash
docker pull ghcr.io/eduardo-macedo07/booking-api:latest
```

Requisitos: `DATABASE_URL`, `JWT_SECRET`, porta `3000` (ou `PORT`), health check em `/health/ready` e um passo de
`npx prisma migrate deploy` antes de subir a nova versão (release command, init container ou job).

## Segurança em produção

- **`/metrics` não tem autenticação.** Deixe-o acessível só pela rede interna (Prometheus), e bloqueie o caminho
  no proxy público (ex.: Nginx: `location /metrics { deny all; }`).
- Troque as senhas do seed e do Grafana (`admin`/`admin` no Compose é só para desenvolvimento).
- O rate limit é por instância (ADR 0005); com várias réplicas, use um storage compartilhado.
- Faça backup do banco e teste a restauração.
