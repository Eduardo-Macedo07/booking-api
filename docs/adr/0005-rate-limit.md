# ADR 0005: Rate limit em duas camadas, em memória

- **Status:** aceita (com limitação conhecida)

## Contexto

Login e cadastro são alvos de força bruta; o restante da API precisa de proteção contra abuso e excesso de uso.

## Decisão

`@nestjs/throttler` como guard global, em duas camadas:

- `default`: 100 requisições por minuto por IP em toda a API (`THROTTLE_LIMIT`).
- `auth`: 10 por minuto por IP, **só** em `register`, `login` e `refresh` (`AUTH_THROTTLE_LIMIT`). `/auth/me` e
  `/auth/logout` ficam fora desse limite extra.
- `/health` e `/metrics` ficam fora de qualquer limite (probes e scrapes não podem ser bloqueados).
- Os limites vêm do `ConfigService` e a resposta traz `X-RateLimit-*`. O guard é o primeiro da cadeia: barato
  e antes de qualquer trabalho de autenticação.
- Atrás de proxy, `TRUST_PROXY=true` faz o IP real do cliente ser usado (senão todos contariam como um só).

## Consequências

- O armazenamento padrão é **em memória, por instância**. Com N réplicas, o limite efetivo é N vezes maior.
  Para escalar horizontalmente, trocar por um storage compartilhado (Redis) é uma mudança de configuração do
  módulo, sem alterar o resto do código.
- Limitar por IP prejudica usuários atrás do mesmo NAT; limitar por conta seria um complemento futuro.

## Evidência

`test/throttle.e2e-spec.ts`: as 3 primeiras tentativas de login recebem 401, a 4ª e a 5ª recebem 429, enquanto
`/health` e `/metrics` continuam respondendo 200.
