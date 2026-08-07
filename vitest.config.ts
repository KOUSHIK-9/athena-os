import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist", ".turbo", "**/._*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules",
        "dist",
        "**/*.test.ts",
        "**/*.config.ts",
        "**/index.ts",
        "apps/**",
        "servers/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
    resolve: {
    alias: {
      "@athena-os/executor": path.resolve(__dirname, "packages/executor/src"),
      "@athena-os/shared": path.resolve(__dirname, "packages/shared/src"),
      "@athena-os/sdk": path.resolve(__dirname, "packages/sdk/src"),
      "@athena-os/driver": path.resolve(__dirname, "packages/driver/src"),
      "@athena-os/understanding": path.resolve(__dirname, "packages/understanding/src"),
      "@athena-os/iphone-agent": path.resolve(__dirname, "agents/iphone-agent/src"),
      "@athena-os/mcp-server": path.resolve(__dirname, "servers/mcp-server/src"),
    },
  },
});