import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Pure helpers shared by the Deno edge functions are tested in place.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/_shared/**/*.test.ts"],
    // OTP tests exercise MockOtpService; pin it here so they don't depend on
    // whatever VITE_ENABLE_TEST_OTP happens to be in the local .env.
    env: { VITE_ENABLE_TEST_OTP: "true" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
