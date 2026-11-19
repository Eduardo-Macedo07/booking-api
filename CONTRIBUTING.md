# Contribuindo

## Ambiente

```bash
nvm use                      # Node 24 (.nvmrc)
npm ci
cp .env.example .env
docker compose up -d postgres
npm run db:generate && npm run db:migrate
```

## Antes de abrir um Pull Request

O CI roda exatamente isto; rode localmente primeiro:

```bash
npm run format        # Prettier
npm run lint          # oxlint (avisos também falham)
npm run typecheck
npm run test:cov      # unitários + e2e (precisa de um Postgres de testes migrado, veja o README)
```

## Convenções

- Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`).
- Regra de negócio nova vai em **função pura** quando possível, com teste unitário.
- Mudou o comportamento da API? Atualize o teste e2e correspondente, o Swagger (decorators) e o README.
- Mudou o banco? Crie uma migration (nunca edite uma já aplicada) e confirme que `npm run test:cov` continua passando.
- Decisões que afetam a arquitetura merecem uma [ADR](docs/adr) curta: contexto, alternativas, decisão, consequências.
