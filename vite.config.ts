import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        symbols: resolve(__dirname, "bpmn-symbols/index.html"),
        tutorial: resolve(__dirname, "bpmn-tutorial/index.html"),
        flowchart: resolve(__dirname, "bpmn-vs-flowchart/index.html"),
        examples: resolve(__dirname, "bpmn-examples/index.html"),
        howitworks: resolve(__dirname, "how-it-works/index.html"),
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
