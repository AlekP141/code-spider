import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // ts-morph loads and type-checks a whole tsconfig project on first use.
    // The default 5s timeout is not enough on a cold run.
    testTimeout: 30_000,
  },
});
