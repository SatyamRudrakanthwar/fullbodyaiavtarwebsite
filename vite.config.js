import { defineConfig } from "vite";

// Demo site (index.html). In dev, /api is proxied to the Express server.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
});
