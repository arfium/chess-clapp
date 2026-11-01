import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri v2: fixed dev port; target the WebView engine (Safari-class) like Clatch's GUI.
//
// `dist/` is VITE'S here, and only Vite's. The Clatch depot — the folder `clatch
// validate` / `clatch install` consume — is `pkg/` (scripts/package.sh): the two used to
// be assembled at the same path, so `npm run build:web` wiped the depot and packaging
// wiped the web bundle. One name, one meaning.
//
// `@clappkit` is the shared front-end half of the plumbing (clappkit/web) — plain .ts
// resolved by this alias, so nothing is added to package.json. It lives OUTSIDE this
// project, which has two consequences: `server.fs.allow` must let the dev server read it,
// and its own bare imports (`react`, `@tauri-apps/api/…`) cannot be resolved by walking
// up from a directory that has no node_modules — hence the two aliases below, which point
// them at this app's copies (the same copies the app itself uses, so React is never
// duplicated).
//
// `--mode mock` (`npm run dev:mock`) swaps the two Tauri modules for src/dev/, a chess.js
// stand-in for the core, so the window can be worked on in an ordinary browser. The
// specific aliases must come before the `@tauri-apps/api` prefix alias, which is why
// this is the array form.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: [
      ...(mode === "mock"
        ? [
            { find: "@tauri-apps/api/core", replacement: path.resolve(__dirname, "src/dev/mock-core.ts") },
            { find: "@tauri-apps/api/event", replacement: path.resolve(__dirname, "src/dev/mock-event.ts") },
          ]
        : []),
      { find: "@clappkit", replacement: path.resolve(__dirname, "clappkit/web") },
      { find: "react", replacement: path.resolve(__dirname, "node_modules/react") },
      { find: "@tauri-apps/api", replacement: path.resolve(__dirname, "node_modules/@tauri-apps/api") },
    ],
  },
  server: { port: mode === "mock" ? 1422 : 1421, strictPort: true, fs: { allow: ["."] } },
  build: { target: "safari15" },
}));
