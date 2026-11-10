import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Dev: forward API calls to the Spring Boot backend (no CORS needed).
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:8081",
        changeOrigin: true,
        // The browser sees the proxy as same-origin, so CORS isn't needed. Without this the Origin
        // header is forwarded and the backend rejects any address other than localhost (403).
        configure: (proxy) => proxy.on("proxyReq", (req) => req.removeHeader("origin")),
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
