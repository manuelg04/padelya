import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
