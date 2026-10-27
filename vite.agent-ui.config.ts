import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Isolated QA only. Unlike the Presentation demo, alias host components to repo root.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 4184, strictPort: true },
});
