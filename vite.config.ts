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
      ignored: ["**/docs/**", "**/dist/**"],
    },
    hmr: {
      overlay: false,
    },
  },
  // mcpPlugin is disabled everywhere: on Windows its Supabase sync mishandles absolute
  // paths (see supabase/functions/mcp/index.ts), so that function is hand-maintained
  // and must never be regenerated, in dev or in a build.
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
