import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    // Exclude Playwright e2e specs — they are run by `test:e2e` not vitest
    exclude: ["node_modules/**", ".next/**", "src/tests/e2e/**", "**/*.spec.ts"],
    include: ["src/tests/unit/**/*.test.{ts,tsx}", "src/tests/integration/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/domain/**", "src/lib/**", "src/store/**", "src/features/**"],
      exclude: ["node_modules/**", ".next/**", "src/tests/**", "**/*.d.ts", "**/*.config.*"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
