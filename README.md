# Booking API

[![CI](https://github.com/Eduardo-Macedo07/booking-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Eduardo-Macedo07/booking-api/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-24-339933?logo=node.js&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

API REST de **reservas e agendamento de recursos** (salas, equipamentos, laboratórios…), feita para ser
operada como um serviço de verdade: autenticação com rotação de tokens, regras de negócio garantidas pelo
banco, testes de concorrência, métricas, logs estruturados, CI/CD e deploy com Docker.

> O foco não é a quantidade de endpoints, e sim as **decisões de engenharia** por trás de cada um.
> Elas estão registradas em [`docs/adr`](docs/adr) e comprovadas por testes.

![Dashboard do Grafana com métricas da API](docs/images/grafana-dashboard.png)

_Dashboard provisionado automaticamente (`docker compose up`), com tráfego real: requisições, latência p95
por rota, reservas criadas/canceladas/recusadas e saúde do processo Node._

## Destaques

- **Sem reservas duplicadas, mesmo sob concorrência.** Quem decide é o banco: uma constraint `EXCLUDE USING gist`
  no PostgreSQL impede sobreposição de horários. Um teste dispara 30 requisições simultâneas pelo mesmo horário
  e exige exatamente 1 vencedora. Para provar que o teste vale, rodei a suíte num banco **sem** a constraint:
  9 testes falharam. [Detalhes na ADR 0001](docs/adr/0001-conflitos-de-reserva-no-banco.md).
- **Autenticação de verdade:** JWT de curta duração + refresh token opaco, guardado só como hash, **rotacionado
  a cada uso** com detecção de reuso (token roubado revoga a sessão inteira).
  [ADR 0002](docs/adr/0002-refresh-token-com-rotacao.md).
- **Observabilidade:** logs JSON com `requestId` (pino), métricas Prometheus (HTTP e de negócio), dashboard
  Grafana pronto, `/health/live` e `/health/ready` (checa o banco). [ADR 0004](docs/adr/0004-observabilidade.md).
- **Qualidade verificável:** 129 testes (unitários, de integração com Postgres real e de concorrência),
  cobertura de 98% das linhas, com piso mínimo exigido no CI.
- **Pronto para produção:** imagem Docker multi-stage rodando sem root, `HEALTHCHECK`, migrations versionadas,
  CI com teste de fumaça da stack completa, publicação da imagem no GHCR e blueprint de deploy.
- **Segurança básica feita direito:** validação rigorosa de entrada (campos desconhecidos são recusados),
  `helmet`, rate limit em duas camadas, respostas de login indistinguíveis entre "e-mail inexistente" e
  "senha errada", e 404 (e não 403) para reservas de outras pessoas.

## Stack

| Camada       | Tecnologia                                                           |
| ------------ | -------------------------------------------------------------------- |
| Framework    | NestJS 12 (TypeScript, ESM), validação com `class-validator`          |
| Banco        | PostgreSQL 17 + Prisma 7 (driver adapter `pg`)                       |
| Autenticação | JWT (`@nestjs/jwt`), bcrypt, refresh token com rotação                |
| Operação     | pino (logs), Prometheus + Grafana (métricas), Terminus (health)       |
| Documentação | OpenAPI/Swagger em `/docs`                                           |
| Testes       | Vitest + Supertest (contra Postgres real)                            |
| Entrega      | Docker, Docker Compose, GitHub Actions, GHCR, Render (blueprint)     |

## Como rodar

### Com Docker (recomendado)

Sobe API, PostgreSQL, Prometheus e Grafana, já com as migrations aplicadas:

```bash
docker compose up --build
```

Em outro terminal, crie o administrador e alguns recursos de exemplo:

```bash
docker compose --profile seed run --rm seed
```

| Serviço    | URL                                                   |
| ---------- | ----------------------------------------------------- |
| API        | http://localhost:3000 (documentação interativa em `/docs`) |
| Prometheus | http://localhost:9090                                 |
| Grafana    | http://localhost:3001 (`admin` / `admin`, dashboard "Booking API") |

O seed cria `admin@example.com` / `admin-senha-123` (**apenas para desenvolvimento**). O arquivo
[`requests.http`](requests.http) traz um roteiro pronto de chamadas.

> Se a porta 5432 já estiver em uso na sua máquina: `POSTGRES_PORT=15432 docker compose up --build`.

### Sem Docker (desenvolvimento)

Requisitos: Node.js 24 (`.nvmrc`; funciona também no 22) e um PostgreSQL acessível.

```bash
npm ci
cp .env.example .env                  # ajuste DATABASE_URL e JWT_SECRET
npm run db:generate                   # gera o cliente Prisma
npm run db:migrate                    # aplica as migrations (e as cria, se você alterar o schema)
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=admin-senha-123 SEED_DEMO=true npm run db:seed
npm run start:dev
```

## A API

Documentação completa e testável em **`/docs`** (Swagger UI). Resumo:

| Método e rota                        | Acesso     | Descrição                                                   |
| ------------------------------------ | ---------- | ----------------------------------------------------------- |
| `POST /auth/register`                | público    | Cria conta (sempre papel `USER`)                            |
| `POST /auth/login`                   | público    | Autentica; devolve `accessToken` e `refreshToken`            |
| `POST /auth/refresh`                 | público    | Troca o refresh token por um novo par (uso único)           |
| `POST /auth/logout`                  | público    | Revoga a sessão                                             |
| `GET /auth/me`                       | autenticado | Dados do usuário                                           |
| `GET /resources`                     | autenticado | Lista recursos (paginado, busca por nome)                  |
| `GET /resources/:id`                 | autenticado | Detalhes                                                   |
| `GET /resources/:id/availability`    | autenticado | Horários ocupados e janelas livres (período de até 31 dias) |
| `POST/PATCH/DELETE /resources[/:id]` | **admin**  | Gerencia recursos (`DELETE` desativa, preservando o histórico) |
| `POST /bookings`                     | autenticado | Cria reserva                                               |
| `GET /bookings`                      | autenticado | Suas reservas (admin vê todas); filtros e paginação        |
| `GET /bookings/:id`                  | autenticado | Detalhes (só do dono ou admin)                             |
| `POST /bookings/:id/cancel`          | autenticado | Cancela                                                    |
| `GET /health/live`, `/health/ready`  | público    | Liveness e readiness (checa o banco)                       |
| `GET /metrics`                       | interno    | Métricas Prometheus (não exponha publicamente)             |

Exemplo:

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"admin-senha-123"}' | jq -r .accessToken)

curl -s -X POST localhost:3000/bookings \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"resourceId":"<id>","startsAt":"2027-03-01T14:00:00Z","endsAt":"2027-03-01T15:30:00Z"}'
```

Erros seguem um formato único e carregam um `code` estável nos casos de negócio:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "The resource is already booked for part of this period",
  "code": "BOOKING_OVERLAP",
  "requestId": "bbc0f529-3b20-448b-a84a-c141c12e7767"
}
```

### Regras de negócio

- Início e fim em múltiplos de 15 minutos; duração entre 15 minutos e 8 horas; sempre no futuro.
- Reservas coladas são válidas (uma pode começar quando outra termina).
- Um recurso não tem duas reservas confirmadas sobrepostas (`BOOKING_OVERLAP`, 409).
- Uma pessoa não fica em duas reservas ao mesmo tempo (`USER_OVERLAP`, 409).
- Usuário cancela até `CANCELLATION_MIN_HOURS` (padrão 2 h) antes do início; admin, a qualquer momento.
- Recurso desativado não aceita novas reservas (`RESOURCE_INACTIVE`, 422).

## Testes

```bash
docker compose up -d postgres                                    # ou qualquer Postgres local
DATABASE_URL=postgresql://booking:booking@localhost:5432/booking_test npm run db:deploy

npm test            # 71 testes unitários (rápidos, sem banco)
npm run test:e2e    # 58 testes de integração e concorrência (Postgres real)
npm run test:cov    # tudo junto, com cobertura e piso mínimo (usado no CI)
```

Cobertura atual: **98,2 %** das instruções, **88,6 %** dos ramos, **100 %** das funções.
O CI falha se ela cair abaixo de 90 / 80 / 95 / 90 %.

O que é testado de ponta a ponta: cadastro e login, rotação e reuso de refresh token, controle de acesso por
papel, CRUD de recursos, todas as regras de reserva, cancelamento, paginação e filtros, `/metrics`, health,
cabeçalhos de segurança, rate limit e **concorrência** (30 usuários no mesmo horário; um usuário em 10
recursos ao mesmo tempo; janelas parcialmente sobrepostas).

## Operação

- **Logs:** JSON em produção (pretty em desenvolvimento), com `requestId` em cada linha; o cabeçalho
  `X-Request-Id` é aceito de entrada e devolvido na resposta. `Authorization`, cookies e senhas são mascarados.
- **Métricas:** `http_request_duration_seconds` (rotulada por rota, não por URL), `bookings_created_total`,
  `bookings_cancelled_total`, `bookings_rejected_total{reason}` e as métricas padrão do Node.
- **Configuração:** toda via variáveis de ambiente, validadas na subida (a app não inicia com configuração
  inválida). Lista completa em [`.env.example`](.env.example).
- **Deploy:** veja [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md): módulos, modelo de dados, fluxos.
- [Decisões de arquitetura (ADRs)](docs/adr): o "porquê" de cada escolha importante.
- [Deploy](docs/DEPLOY.md): Docker, Render, variáveis, migrations, segurança.
- [Como contribuir](CONTRIBUTING.md).

## Limitações conhecidas

Escolhas conscientes de escopo, não esquecimentos:

- O rate limit é **em memória**, por instância. Com várias réplicas, é preciso um armazenamento compartilhado
  (Redis). [ADR 0005](docs/adr/0005-rate-limit.md).
- Não há verificação de e-mail nem recuperação de senha.
- Horários são em UTC; não há fuso por recurso, horário de funcionamento nem reservas recorrentes.
- `/metrics` não exige autenticação: é para rede interna.
- A imagem inclui a CLI do Prisma (para rodar migrations em qualquer plataforma), o que a deixa maior que o mínimo.

## Licença

[MIT](LICENSE) © Eduardo Gabriel Macedo
