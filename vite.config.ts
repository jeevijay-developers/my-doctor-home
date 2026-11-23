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
          // Exact package match: a loose "/react/" test also caught @tiptap/react and pulled the
          // whole rich-text editor into this (always-loaded) chunk.
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run\/router)\//.test(id)) {
            return "vendor-react";
          }
          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("@radix-ui")) {
            return "vendor-radix";
          }
          // Do NOT force tiptap/prosemirror or jspdf/html2canvas into named vendor
          // chunks: doing so put Vite's shared preload helper inside them, so the
          // entry chunk statically imported ~1 MB of editor + PDF code on every
          // page, including the public doctor site. Left to Rollup they stay in
          // the lazy chunks that actually use them.
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
