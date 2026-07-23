import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": "/Users/volodymyrborysenko/Code/largevcmodel/src",
      "server-only": "/Users/volodymyrborysenko/Code/largevcmodel/tests/server-only-shim.ts",
    },
  },
});
