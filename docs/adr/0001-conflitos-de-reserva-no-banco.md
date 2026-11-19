# ADR 0001: Conflitos de reserva decididos pelo banco de dados

- **Status:** aceita

## Contexto

Duas pessoas podem tentar reservar o mesmo recurso no mesmo horário ao mesmo tempo. A regra "um recurso não
pode ter duas reservas sobrepostas" precisa valer **sempre**, inclusive com várias requisições simultâneas e
várias instâncias da API.

## Alternativas consideradas

1. **Consultar e depois inserir** (`SELECT` de conflitos, `INSERT` se nada veio). Simples, mas tem uma janela
   de corrida entre as duas operações: duas requisições leem "livre" e ambas inserem.
2. **Transação `SERIALIZABLE` com retentativas.** Correta, mas empurra para a aplicação a complexidade de
   detectar falhas de serialização e repetir, e piora a latência sob disputa.
3. **Trava explícita** (`SELECT ... FOR UPDATE` no recurso ou advisory lock). Correta, mas serializa todas as
   reservas do recurso e depende de todo código de escrita lembrar de pegar a trava.
4. **Constraint de exclusão do PostgreSQL** (`EXCLUDE USING gist`). O próprio banco rejeita, de forma atômica,
   a linha que se sobrepõe a outra.

## Decisão

Opção 4. Duas constraints (migration `init`), ambas sobre o intervalo semiaberto `[startsAt, endsAt)` e só para
reservas `CONFIRMED` (cancelar libera o horário):

```sql
EXCLUDE USING gist ("resourceId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE ("status" = 'CONFIRMED')
EXCLUDE USING gist ("userId"     WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE ("status" = 'CONFIRMED')
```

O serviço faz o `INSERT` direto e traduz a violação (`SQLSTATE 23P01`, nome da constraint) em
`409 BOOKING_OVERLAP` ou `409 USER_OVERLAP`. Um `CHECK` garante `endsAt > startsAt`.

## Consequências

- **Correção por construção:** nenhum caminho de código, script ou instância consegue gravar reservas
  sobrepostas. Não há janela de corrida.
- Sem retentativas, sem travas, sem estado extra na aplicação.
- O Prisma não modela `EXCLUDE`: a constraint vive em SQL escrito à mão na migration (ADR 0003) e o erro chega
  como `P2039` com o erro do Postgres em `meta.driverAdapterError.cause`, tratado em `prisma-errors.ts`.
- Acopla a regra ao PostgreSQL (extensão `btree_gist`). Aceito: é a base de dados do projeto.

## Evidência

Os testes de concorrência (`test/concurrency.e2e-spec.ts`) disparam 30 requisições simultâneas pelo mesmo
horário e exigem exatamente 1 resposta `201` e 29 `409`.

Para garantir que o teste realmente protege, rodei os testes de reservas e concorrência (26 testes) em um banco
criado **sem** as constraints: **9 falharam**, incluindo os 3 de concorrência. Com as constraints, os 26 passam.
