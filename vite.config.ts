import { defineConfig } from "vite";
export default defineConfig({
 base: "./",
 build: { target: "es2022", outDir: "site-dist", rollupOptions: { input: {
  lab: "index.html", minimal: "examples/minimal/index.html", react: "examples/react/index.html",
  custom: "examples/custom-node/index.html", media: "examples/media/index.html"
 }}},
 test: { include: ["tests/**/*.test.ts"] }
});
