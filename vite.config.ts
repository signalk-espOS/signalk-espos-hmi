import { defineConfig } from "vite";

// Signal K serves public/ at /signalk-espos-hmi/, so every URL in the
// bundle stays relative.
export default defineConfig({
  root: "webapp",
  base: "./",
  build: {
    outDir: "../public",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    proxy: {
      "/signalk": {
        target: process.env.SIGNALK_DEV_URL ?? "http://127.0.0.1:3000",
        ws: true,
      },
      "/plugins": process.env.SIGNALK_DEV_URL ?? "http://127.0.0.1:3000",
    },
  },
});
