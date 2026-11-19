# ADR 0003: Prisma 7 com SQL manual nas migrations

- **Status:** aceita

## Contexto

Precisamos de acesso tipado ao banco e migrations versionadas, mas também de recursos do PostgreSQL que o
modelo do Prisma não expressa (constraints `EXCLUDE`, `CHECK`, extensão `btree_gist`).

## Decisão

- Usar Prisma para modelo, cliente tipado e migrations, e **complementar a migration `init` com SQL escrito à
  mão** (criada com `prisma migrate dev --create-only` e editada antes de aplicar).
- Usar o adaptador `@prisma/adapter-pg` (obrigatório no Prisma 7), com cliente gerado em `src/generated`
  (ignorado pelo Git, gerado no `build`).
- **Fixar a série 7** (`prisma@7`): no momento da escrita, a tag `latest` do `prisma` no npm aponta para um
  pré-lançamento da série 8, com CLI diferente. O Dependabot está configurado para não subir o major sozinho.

## Consequências

- O esquema real do banco é a soma de `schema.prisma` + SQL das migrations; o `prisma migrate` aplica ambos e
  não acusa divergência por causa das constraints extras.
- Erros do driver chegam como `P2039`; `prisma-errors.ts` isola esse detalhe (e tem testes próprios).
- Trocar de ORM no futuro afetaria o PrismaService e esse módulo de erros, não as regras de negócio.
