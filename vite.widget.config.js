import { defineConfig } from "vite";

// Standalone embeddable bundle: dist/avatar-guide.js (one <script> tag, no deps).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    chunkSizeWarningLimit: 1500,
    lib: {
      entry: "src/embed.js",
      name: "AvatarGuide",
      formats: ["iife"],
      fileName: () => "avatar-guide.js",
    },
  },
});
