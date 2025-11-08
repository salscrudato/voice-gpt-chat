import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    strictPort: false,
    // Enable compression for faster development
    middlewareMode: false,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
    target: "esnext",
    reportCompressedSize: false,
    // Optimize chunk size
    chunkSizeWarningLimit: 500,
    // Enable CSS code splitting
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Aggressive code splitting for better caching
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes("node_modules/react")) {
            return "react";
          }
          if (id.includes("node_modules/react-icons")) {
            return "icons";
          }
          if (id.includes("node_modules/firebase")) {
            return "firebase";
          }
          if (id.includes("node_modules/@google-cloud")) {
            return "google-cloud";
          }
          // Service chunks
          if (id.includes("services/")) {
            return "services";
          }
          // Utils chunks
          if (id.includes("utils/")) {
            return "utils";
          }
          // Component chunks
          if (id.includes("components/")) {
            return "components";
          }
          // Page chunks
          if (id.includes("pages/")) {
            return "pages";
          }
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

