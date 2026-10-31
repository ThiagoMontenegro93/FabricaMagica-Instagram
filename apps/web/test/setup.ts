process.env.JWT_SECRET ??= "segredo-de-teste-com-mais-de-32-caracteres!!";
process.env.DATABASE_URL ??= "postgresql://fabrica:fabrica_dev@localhost:5432/fabrica_magica_test?schema=public";
// NODE_ENV fica "test" (definido pelo vitest).
process.env.DOCS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.DOCS_DIR ??= `${require("node:os").tmpdir()}/fabrica-docs-test`;
process.env.CRON_SECRET ??= "segredo-do-cron-de-teste";
