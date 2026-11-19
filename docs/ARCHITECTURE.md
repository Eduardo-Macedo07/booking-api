# Arquitetura

## Visão geral

Monólito modular em NestJS. Cada módulo de domínio tem controller (HTTP e documentação), service (regras)
e DTOs (contrato e validação de entrada). O acesso ao banco é feito pelo Prisma, injetado como provider.

```mermaid
flowchart LR
    Client([Cliente]) -->|HTTP| API
    subgraph API [Booking API - NestJS]
        direction TB
        G[Guards globais<br/>Throttler → JWT → Roles] --> C[Controllers]
        C --> S[Services<br/>regras de negócio]
        S --> P[(PrismaService)]
        M[HttpMetricsInterceptor] -.mede.-> C
    end
    P --> PG[(PostgreSQL 17<br/>constraints de integridade)]
    Prom[Prometheus] -->|scrape /metrics| API
    Graf[Grafana] --> Prom
```

## Estrutura

```
src/
  main.ts, app.setup.ts     bootstrap e configuração compartilhada com os testes e2e
  app.module.ts             composição dos módulos e dos guards globais
  config/env.ts             variáveis de ambiente validadas com Zod
  auth/                     cadastro, login, refresh com rotação, guards JWT e de papéis
  resources/                recursos reserváveis + cálculo de disponibilidade (availability.ts, função pura)
  bookings/                 reservas + regras (booking-rules.ts, funções puras)
  health/                   liveness e readiness (Terminus)
  metrics/                  registro Prometheus, interceptor HTTP e endpoint /metrics
  prisma/                   PrismaService e tradução de erros do driver
  common/                   decorators, paginação, filtro de exceções
prisma/
  schema.prisma             modelo de dados
  migrations/               SQL versionado (inclui as constraints que o Prisma não expressa)
test/                       testes e2e (Postgres real) e helpers
ops/                        Prometheus e Grafana (dashboard provisionado)
```

Regras de negócio ficam em **funções puras** (`booking-rules.ts`, `availability.ts`): recebem dados e `now`
por parâmetro, não tocam no banco e por isso são testadas de forma exaustiva e rápida.

## Modelo de dados

```mermaid
erDiagram
    User ||--o{ Booking : faz
    User ||--o{ RefreshToken : possui
    Resource ||--o{ Booking : recebe
    User {
        uuid id PK
        string email UK
        string name
        string passwordHash
        enum role "USER | ADMIN"
    }
    RefreshToken {
        uuid id PK
        uuid familyId "agrupa a cadeia de rotações"
        string tokenHash UK "sha256, nunca o token"
        timestamptz expiresAt
        timestamptz revokedAt
    }
    Resource {
        uuid id PK
        string name UK
        int capacity
        bool active
    }
    Booking {
        uuid id PK
        timestamptz startsAt
        timestamptz endsAt
        enum status "CONFIRMED | CANCELLED"
        timestamptz cancelledAt
    }
```

Identificadores são UUID v7 (ordenáveis por tempo, bons para índices). Datas usam `timestamptz`.
Constraints no banco, além das chaves: `endsAt > startsAt` e dois `EXCLUDE` (recurso e usuário) sobre o
intervalo `[startsAt, endsAt)` das reservas `CONFIRMED`. Veja a [ADR 0001](adr/0001-conflitos-de-reserva-no-banco.md).

## Fluxo: criar uma reserva

```mermaid
sequenceDiagram
    participant C as Cliente
    participant G as Guards
    participant S as BookingsService
    participant DB as PostgreSQL
    C->>G: POST /bookings (Bearer JWT)
    G->>G: limite de taxa, valida JWT, papel
    G->>S: create(user, dto)
    S->>S: validateBookingWindow (função pura)
    S->>DB: busca recurso (existe? ativo?)
    S->>DB: INSERT booking
    alt horário livre
        DB-->>S: ok
        S-->>C: 201 + reserva
    else conflito (constraint EXCLUDE, SQLSTATE 23P01)
        DB-->>S: erro de exclusão
        S-->>C: 409 BOOKING_OVERLAP / USER_OVERLAP
    end
```

Não existe "consultar se está livre e depois inserir": isso abriria uma janela de corrida entre as duas etapas.
O `INSERT` é a verificação.

## Segurança

| Ameaça                              | Mitigação                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Força bruta de senha                | Limitador `auth` (padrão 10 req/min/IP) + bcrypt                               |
| Enumeração de contas                | Login responde igual para e-mail inexistente e senha errada; compara hash sempre |
| Roubo de refresh token              | Uso único, rotação, detecção de reuso revoga a família; só o hash fica no banco  |
| Escalonamento de privilégio         | Papel nunca vem do cliente; `forbidNonWhitelisted` recusa campos extras         |
| Acesso a dados de outros usuários   | Escopo por usuário no service; 404 (não 403) para não revelar existência         |
| Vazamento em logs                   | `Authorization`, cookies e senhas mascarados; erros 500 não expõem detalhes     |
| Cabeçalhos HTTP inseguros           | `helmet`                                                                       |
| Configuração insegura               | Segredo JWT mínimo de 32 caracteres exigido na subida                           |

## Pipeline

`CI` (GitHub Actions): formatação → lint → tipos → migrations → testes com cobertura mínima → build → imagem
Docker e **teste de fumaça da stack completa** (sobe o Compose, roda o seed, faz login e consulta a API) →
publicação da imagem no GHCR (apenas em `main`/tags e só se tudo passou). Dependabot atualiza npm, Actions e Docker.
