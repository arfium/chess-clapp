# Third-Party Notices

`scripts/package.sh` copies this file into the depot so the notices travel with the
installed app.

## Stockfish 18 (stockfish.js) — GPL-3.0

`public/engine/stockfish.js` and `public/engine/stockfish.wasm` are the lite,
single-threaded WebAssembly build of **Stockfish 18** from
[stockfish.js](https://github.com/nmrugg/stockfish.js) (npm `stockfish@18.0.7`,
`bin/stockfish-18-lite-single.{js,wasm}`, unmodified), embedded in the binary with the
rest of the window and run in a Web Worker. It is a separate program the window talks
to over UCI text messages.

    Stockfish.js (c) 2026, Chess.com, LLC
    Based on Stockfish (c) T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other
    contributors. Nets by Linmiao Xu (linrock).

Licensed under the GNU General Public License v3; the full text ships as
`public/engine/COPYING.txt`. Source: https://github.com/official-stockfish/Stockfish
and https://github.com/nmrugg/stockfish.js.

sha256 (as vendored):

    2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe  stockfish.js
    a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1  stockfish.wasm

## shakmaty — GPL-3.0-or-later

The game core's move generation, SAN and FEN (`src-tauri`, crate `shakmaty` 0.27) —
https://github.com/niklasf/shakmaty.

## chess.js — BSD-2-Clause

Move rules for the window's own analysis (history, variations, imported PGN/FEN) —
https://github.com/jhlywa/chess.js, Copyright (c) 2025, Jeff Hlywa.

## Piece sets

All from the [lichess](https://github.com/lichess-org/lila) collection
(`public/piece/<set>`), in `public/pieces/<set>/`, unmodified. Only sets whose licence
permits redistribution in this app are included.

| set | author | licence |
|---|---|---|
| cburnett | Colin M.L. Burnett | GPLv2+ |
| merida | Armando Hernandez Marroquin | GPLv2+ |
| chessnut | Alexis Luengas | Apache-2.0 |
| mpchess | Maxime Chupin | GPLv3+ |
| celtic, fantasy, spatial | Maurizio Monge | MIT |
| papercut | Nikolay Anzarov | CC BY 4.0 |
| rhosgfx | RhosGFX | CC0 1.0 |
| totoy | Kosal Sen | CC BY 4.0 |
| kiwen-suwi | neverRare | CC BY 4.0 |
| shapes | flugsio | CC BY-SA 4.0 |

## Fonts — SIL Open Font License 1.1

Bundled through `@fontsource` and embedded with the window: **Newsreader** (Production
Type, for Google Fonts), **IBM Plex Sans** and **IBM Plex Mono** (IBM). All three are
under the SIL Open Font License, Version 1.1 — https://openfontlicense.org.

## Board sounds — CC0-1.0

`public/sounds/*.mp3`, cut from Freesound recordings released under CC0
(https://creativecommons.org/publicdomain/zero/1.0/):

| file | source |
|---|---|
| `move.mp3`, `capture.mp3` | “Chess Pieces Move (Close)” by JJTaynos — https://freesound.org/s/733927/ (hits at 38.53 s and 41.04 s) |
| `notify.mp3` | “Tsamp9_Te_Papa_Xylophone.wav” by rabbydaw — https://freesound.org/s/504183/ |
| `error.mp3` | “Quick Beep High to Low” by PostRobcore — https://freesound.org/s/523702/ |

Each was conformed (`scripts/sounds/`) to the lichess *standard* sound it replaces —
same file length and onset, matched loudness, third-octave spectral balance and
envelope. The lichess files are used only as a measurement reference during that
process; they are not redistributed (lila lists them as non-free).

## Speed marks

`src/assets/speed/blitz.svg` (⚡ U+26A1) and `src/assets/speed/rapid.svg` (⏱ U+23F1) are
from [Noto Emoji](https://github.com/googlefonts/noto-emoji) (`2D/svg`), Copyright Google
LLC, Apache License 2.0, unmodified. `bullet.svg` was drawn for this app in the same style
(Unicode has no bullet emoji).


## Opening names — CC0-1.0

`public/openings.json` is derived from
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) by
`scripts/build-openings.mjs`.

## Everything else

React (MIT), Tauri (MIT/Apache-2.0) and the rest of the dependency tree are under
their own permissive licences, as recorded in `package-lock.json` and
`src-tauri/Cargo.lock`.

## The banner

`assets/banner.jpg` is cut from "LittleChess.jpg" by UzbekistanWikiEditor,
<https://commons.wikimedia.org/wiki/File:LittleChess.jpg>, under
CC BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>): cropped to a band and resized.
