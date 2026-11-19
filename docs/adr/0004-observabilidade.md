# ADR 0004: Observabilidade com padrões abertos (pino, Prometheus, Grafana)

- **Status:** aceita

## Contexto

Um serviço que ninguém consegue observar não está pronto para produção. Precisamos responder: está de pé? está
lento? está falhando? o negócio está funcionando (reservas sendo criadas, recusadas)?

## Decisão

- **Logs:** `pino` em JSON (pretty em desenvolvimento). Cada requisição recebe um `requestId` (aproveita o
  `X-Request-Id` do proxy, se vier), presente em todos os logs dela, no cabeçalho de resposta e no corpo de
  erros. `Authorization`, cookies e senhas são mascarados.
- **Métricas:** Prometheus (`@prometheus-io/client`, sucessor oficial do `prom-client`):
  - `http_request_duration_seconds` (histograma) rotulada por **rota** (`/bookings/:id`), nunca por URL. Rotular
    por URL criaria uma série por id e derrubaria o Prometheus (explosão de cardinalidade).
  - Métricas de negócio: `bookings_created_total`, `bookings_cancelled_total{by}`, `bookings_rejected_total{reason}`.
  - Métricas padrão do processo Node (event loop, memória, GC).
- **Health:** `/health/live` (processo de pé, sem tocar no banco, para não reiniciar a app por falha de
  dependência) e `/health/ready` (checa o banco, usado como health check de deploy).
- **Dashboard** do Grafana versionado e provisionado em `ops/`, para que `docker compose up` já entregue
  gráficos úteis.
- Padrões abertos (OpenMetrics/Prometheus, JSON) em vez de SDK de fornecedor: nada prende o projeto a um
  serviço pago e qualquer plataforma consegue coletar.

## Consequências

- `/metrics` é sem autenticação (é para a rede interna). Em produção, não deve ser exposto no proxy público.
- Métricas são por instância; o Prometheus agrega entre instâncias.
- Não há tracing distribuído (OpenTelemetry). Seria o próximo passo se o sistema virasse vários serviços.
