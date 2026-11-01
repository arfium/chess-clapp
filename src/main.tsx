import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The three faces ship inside the app (the window must look right offline): Newsreader
// for the few sentences that announce the game, IBM Plex Sans for everything read while
// playing, IBM Plex Mono for FEN and ECO codes.
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/500.css";
import App from "./App";
import { getSettings } from "./lib/settings";
import "./styles.css";

// Apply the window theme before the first paint, so the app never opens in the wrong
// colours and fades across to the right ones.
{
  const t = getSettings().appTheme;
  const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = t === "system" ? (dark ? "night" : "scoresheet") : t;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
