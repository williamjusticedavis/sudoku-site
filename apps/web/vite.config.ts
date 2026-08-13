import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true, // bind 0.0.0.0 so the container is reachable from the host
    watch: {
      // Docker bind mounts on macOS don't deliver fs events reliably; poll.
      usePolling: true,
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // React's Vite plugin must come AFTER the TanStack Start plugin.
    viteReact(),
  ],
});
