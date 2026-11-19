# ADR 0002: Refresh token opaco com rotação e detecção de reuso

- **Status:** aceita

## Contexto

Um JWT de acesso de vida longa é um risco: se vazar, vale até expirar e não dá para revogar. Um de vida curta
exige uma forma de renovar sem pedir a senha de novo.

## Decisão

- **Access token:** JWT (HS256), 15 minutos, enviado em `Authorization: Bearer`. Sem estado no servidor.
- **Refresh token:** valor aleatório opaco (48 bytes), 7 dias. No banco fica **apenas o hash sha256**; um
  vazamento do banco não entrega tokens utilizáveis.
- **Rotação:** cada refresh token vale **uma vez**. `POST /auth/refresh` o revoga e emite um novo par.
- **Detecção de reuso:** todos os tokens de uma sessão pertencem a uma "família" (`familyId`). Se um token já
  revogado é reapresentado, alguém o copiou (ou o cliente está bugado), então **a família inteira é revogada**.
- A revogação usa `UPDATE ... WHERE revokedAt IS NULL` e confere quantas linhas mudaram: se duas requisições
  disputam o mesmo token, só uma vence e a outra é tratada como reuso.
- `POST /auth/logout` revoga a família e é idempotente.

## Consequências

- Um token roubado tem janela de uso curta e é detectado no primeiro conflito entre ladrão e dono legítimo.
- Custa uma escrita no banco por renovação e uma tabela a mais (com limpeza de expirados como melhoria futura).
- O access token não pode ser revogado antes de expirar (aceito: 15 minutos). Trocar de papel de um usuário
  só vale no próximo login/renovação.

## Evidência

`test/auth.e2e-spec.ts` cobre rotação, reuso (o token novo, legítimo, também é invalidado), expiração, logout
idempotente e renovações simultâneas. `auth.service.spec.ts` cobre a corrida (`count === 0`).
