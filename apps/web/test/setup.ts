process.env.JWT_SECRET ??= "segredo-de-teste-com-mais-de-32-caracteres!!";
process.env.DATABASE_URL ??= "postgresql://fabrica:fabrica_dev@localhost:5432/fabrica_magica_test?schema=public";
// NODE_ENV fica "test" (definido pelo vitest).
