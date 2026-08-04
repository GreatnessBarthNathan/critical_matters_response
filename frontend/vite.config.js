import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev proxy must point at whatever port the API is actually configured to use, so read the
 * project's own .env rather than duplicating the value here. macOS AirPlay Receiver occupies
 * port 5000, so a local override is common.
 * Precedence: API_PROXY_TARGET > API_PORT > PORT in ../.env > 5000.
 */
function apiPortFromEnvFile() {
  try {
    const envPath = fileURLToPath(new URL('../.env', import.meta.url));
    const match = readFileSync(envPath, 'utf8').match(/^\s*PORT\s*=\s*(\d+)\s*$/m);
    return match?.[1];
  } catch {
    return undefined; // No .env yet — fall back to the default port.
  }
}

const apiTarget = process.env.API_PROXY_TARGET
  || `http://localhost:${process.env.API_PORT || apiPortFromEnvFile() || 5000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly on a port clash instead of silently moving and breaking the proxy.
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
