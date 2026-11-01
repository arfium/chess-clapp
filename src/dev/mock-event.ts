//! DEV ONLY: `@tauri-apps/api/event`'s `listen`, for `npm run dev:mock`. See mock-core.ts.

type Handler = (e: { payload: unknown }) => void;
const handlers = new Map<string, Set<Handler>>();

export type UnlistenFn = () => void;

export async function listen<T>(name: string, cb: (e: { payload: T }) => void): Promise<UnlistenFn> {
  const set = handlers.get(name) ?? new Set();
  handlers.set(name, set);
  set.add(cb as Handler);
  return () => set.delete(cb as Handler);
}

export function emit(name: string, payload: unknown): void {
  for (const h of handlers.get(name) ?? []) h({ payload });
}
