import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    watch: {
      ignored: ["**/docs/**", "**/dist/**", "**/*.md"],
    },
    hmr: {
      overlay: false,
    },
  },
  // mcpPlugin is disabled everywhere: on Windows its Supabase sync mishandles absolute
  // paths (see supabase/functions/mcp/index.ts), so that function is hand-maintained
  // and must never be regenerated, in dev or in a build.
  build: {
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("/react/")) {
            return "vendor-react";
          }
          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("@radix-ui")) {
            return "vendor-radix";
          }
          if (id.includes("recharts") || id.includes("d3-")) {
            return "vendor-charts";
          }
          if (id.includes("@tiptap") || id.includes("prosemirror")) {
            return "vendor-editor";
          }
          if (id.includes("jspdf") || id.includes("html2canvas")) {
            return "vendor-pdf";
          }
          if (id.includes("framer-motion")) {
            return "vendor-motion";
          }
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
