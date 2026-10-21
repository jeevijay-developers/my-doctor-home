import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // OTP tests exercise MockOtpService; pin it here so they don't depend on
    // whatever VITE_ENABLE_TEST_OTP happens to be in the local .env.
    env: { VITE_ENABLE_TEST_OTP: "true" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
