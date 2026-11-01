//! Paste a PGN or a FEN to look at it on this board. Nothing here touches the live game.

import { useState } from "react";
import { parseImport, type Imported } from "../lib/chess";
import { Dialog } from "./ui";

export function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (g: Imported) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    const g = parseImport(text);
    if (!g) {
      setError("Not a valid PGN or FEN");
      return;
    }
    onImport(g);
  };
  return (
    <Dialog title="Load PGN or FEN" onClose={onClose}>
      <textarea
        className="textarea"
        value={text}
        autoFocus
        spellCheck={false}
        placeholder="1. e4 e5 2. Nf3 Nc6 …" 
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
        }}
      />
      {error && <p className="dialog__error">{error}</p>}
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={go}>
          Load
        </button>
      </div>
    </Dialog>
  );
}
