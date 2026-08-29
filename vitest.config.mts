import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": projectRoot
    }
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85
      },
      include: [
        "app/contact/actions.ts",
        "components/forms/contact-form.tsx",
        "lib/services/{availability,calendar-links,contact,email,email-layout,guest-booking-defaults,sanitize}.ts",
        "lib/domain/year-groups.ts",
        "lib/utils.ts"
      ]
    }
  }
});
