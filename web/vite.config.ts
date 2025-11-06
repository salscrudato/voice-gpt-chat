import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
    target: "esnext",
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          icons: ["react-icons"],
          firebase: ["firebase/app", "firebase/firestore", "firebase/storage"],
          services: [
            "./src/services/chatSessionService.ts",
            "./src/services/insightService.ts",
          ],
        },
        chunkFileNames: "chunks/[name]-[hash].js",
        entryFileNames: "[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-icons"],
    exclude: ["firebase"],
    esbuildOptions: {
      supported: {
        bigint: true,
      },
    },
  },
});

