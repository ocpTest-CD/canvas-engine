import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist",
    lib: {
      entry: {
        index: "src/index.ts",
        core: "src/core.ts",
        react: "src/react.ts",
      },
      formats: ["es"],
      fileName: (_, name) => `${name}.js`,
      cssFileName: "canvas-engine",
    },
    rollupOptions: {
      external: ["pixi.js", "rbush", "react", "react-dom", "react/jsx-runtime"],
    },
  },
});
