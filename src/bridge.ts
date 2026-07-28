import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Player = { kind: "empty" | "human" | "agent"; name?: string; id?: string };
export type Legal = { from: number; to: number; promo: string | null };
export type ChessState = {
  fen: string; turn: "w" | "b"; status: string; result: string | null; winner: string | null;
  inCheck: boolean; board: (string | null)[]; white: Player; black: Player;
  yourColor: string | null; last: { from: number; to: number } | null; legal: Legal[];
  moves: string[]; seatsReady: boolean; hasHuman: boolean; agents: { id: string; name: string }[];
};

export async function cmd(req: unknown): Promise<ChessState> {
  return (await invoke("run_cmd", { req })) as ChessState;
}
export function onState(cb: (s: ChessState) => void): Promise<UnlistenFn> {
  return listen<ChessState>("state", (e) => cb(e.payload));
}
