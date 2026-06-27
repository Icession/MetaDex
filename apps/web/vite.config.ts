import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..");
const pkg = (p: string) => resolve(repoRoot, "packages", p);

// The @metadex/* packages ship raw TypeScript source with no build step. Vite
// won't transpile TS that lives under node_modules, so we alias each bare
// specifier straight to its source file. That makes Vite treat them as project
// source (transpiled + bundled for the browser) instead of opaque deps.
// Note we point @metadex/analyzer at the IMPURE client subpath — the only entry
// the browser needs — keeping the pure core reachable via its own relative imports.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@metadex/analyzer/client": pkg("analyzer/src/client.ts"),
      "@metadex/engine": pkg("engine/src/index.ts"),
      "@metadex/game-profiles": pkg("game-profiles/src/game-profiles.ts"),
    },
  },
  server: {
    // Allow Vite to read the aliased sources that live outside apps/web.
    fs: { allow: [repoRoot] },
  },
});
