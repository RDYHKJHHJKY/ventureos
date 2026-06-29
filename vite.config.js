import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./lib/server/api-router.js";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "ventureos-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/api/")) return next();
          const handled = await handleApiRequest(req, res);
          if (!handled) return next();
        });
      },
    },
  ],
});
