// Ambiente dos testes e2e. Precisa rodar ANTES de importar a aplicação:
// o ConfigModule valida as variáveis assim que o AppModule é carregado.
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://booking:booking@localhost:5432/booking_test';
process.env['JWT_SECRET'] ??= 'e2e-secret-with-at-least-32-characters-long';
process.env['BCRYPT_COST'] = '4'; // hash rápido: segurança de produção não é o foco aqui
process.env['LOG_LEVEL'] = 'silent';
process.env['THROTTLE_LIMIT'] ??= '100000';
process.env['AUTH_THROTTLE_LIMIT'] ??= '100000';
process.env['CANCELLATION_MIN_HOURS'] = '2';
