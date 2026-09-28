import { defineConfig } from "vitest/config";

// Frontend pure-helper tests (public/*.js) in plain node. Kept separate from
// vitest.config.mts so the Worker pool config stays untouched.
export default defineConfig({
  test: {
    include: ["web-tests/**/*.test.mjs"],
    environment: "node",
  },
});
