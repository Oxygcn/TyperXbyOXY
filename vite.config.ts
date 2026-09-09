import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwind()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      // Rust has its own watcher in `tauri dev`.
      // Never let Vite watch running Cargo build scripts on Windows.
      ignored: [
        "**/src-tauri/**",
        "**/backend/**",
        "**/.venv/**",
        "**/build/**",
      ],
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    commonjsOptions: { include: [/generated/, /node_modules/] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
});
