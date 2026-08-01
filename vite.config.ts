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
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@clappkit": path.resolve(__dirname, "clappkit/web"),
      react: path.resolve(__dirname, "node_modules/react"),
      "@tauri-apps/api": path.resolve(__dirname, "node_modules/@tauri-apps/api"),
    },
  },
  server: { port: 1421, strictPort: true, fs: { allow: ["."] } },
  build: { target: "safari15" },
});
