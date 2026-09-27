import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: "src/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            minify: false,
            rollupOptions: {
              external: ['electron', 'chokidar', 'fs', 'path', 'util', 'child_process', 'url'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js'
              }
            }
          },
        },
      },
      {
        entry: "src/preload/index.ts",
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: "dist-electron/preload",
            minify: false,
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js'
              }
            }
          },
        },
      }
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
