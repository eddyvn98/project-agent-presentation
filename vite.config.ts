import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("./", import.meta.url));
const srcRoot = path.join(root, "src") + path.sep;

export default defineConfig({
  plugins: [{
    name: "host-root-alias-for-long-chat-qa",
    enforce: "pre",
    async resolveId(source, importer) {
      // Presentation demos under /src use the portable /src aliases.
      // The long-chat fixture deliberately renders real host components at repository root.
      if (!source.startsWith("@/") || !importer || importer.startsWith(srcRoot)) return null;
      const hostFile = path.join(root, source.slice(2));
      const resolved = await this.resolve(hostFile, importer, { skipSelf: true });
      return resolved ?? null;
    },
  }, react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"], exclude: ["tests/agent/**"], setupFiles: ["./tests/setup.ts"] },
});
