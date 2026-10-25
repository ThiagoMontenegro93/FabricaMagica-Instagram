import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // Testes de integração compartilham o mesmo banco: rodar em série.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
