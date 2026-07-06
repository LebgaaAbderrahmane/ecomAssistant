import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/auth": { target: "http://back:3000", changeOrigin: true },
      "/orders": { target: "http://back:3000", changeOrigin: true },
      "/products": { target: "http://back:3000", changeOrigin: true },
      "/whatsapp": { target: "http://back:3000", changeOrigin: true },
      "/store-connection": { target: "http://back:3000", changeOrigin: true },
      "/agent-config": { target: "http://back:3000", changeOrigin: true },
      "/uploads": { target: "http://back:3000", changeOrigin: true },
      "/customers": { target: "http://back:3000", changeOrigin: true },
      "/escalations": { target: "http://back:3000", changeOrigin: true },
    },
  },
});
