import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // mcpPlugin only runs in dev: on Windows its Supabase sync mishandles absolute paths
  // (see supabase/functions/mcp/index.ts), so supabase/functions/mcp is hand-maintained
  // and must not be regenerated during `vite build`.
  plugins: [react(), mode === "development" && componentTagger(), mode === "development" && mcpPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
