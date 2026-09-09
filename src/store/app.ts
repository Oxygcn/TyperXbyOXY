import { create } from "zustand";
import { connect, isDesktop, parseSnapshot, request } from "../lib/bridge";
import { stageLabels, type Operation, type Snapshot } from "../lib/contracts";
export type Page = "overview" | "studio" | "telegram" | "settings" | "journal";
type Entry = { id: number; time: string; detail: string };
type State = {
  page: Page;
  draft: string;
  bindChat: boolean;
  setBindChat: (value: boolean) => void;
  mode: "manual" | "ai";
  setDraft: (draft: string) => void;
  setMode: (mode: "manual" | "ai") => void;
  connection: "browser" | "disconnected" | "connecting" | "connected" | "error";
  snapshot: Snapshot | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  entries: Entry[];
  navigate: (page: Page) => void;
  init: () => Promise<void>;
  sync: () => Promise<void>;
  run: (
    operation: Operation,
    data?: Record<string, unknown>,
  ) => Promise<unknown>;
  stop: () => Promise<void>;
  disconnected: () => void;
  dismiss: () => void;
};
let syncing = false,
  sequence = 0;
const message = (e: unknown) =>
  typeof e === "string"
    ? e
    : e instanceof Error
      ? e.message
      : "Операция не выполнена";
export const useApp = create<State>((set, get) => ({
  page: "overview",
  draft: "",
  bindChat: true,
  setBindChat: (bindChat) => set({ bindChat }),
  mode: "manual",
  setDraft: (draft) => set({ draft }),
  setMode: (mode) => set({ mode }),
  connection: isDesktop ? "disconnected" : "browser",
  snapshot: null,
  busy: false,
  error: null,
  notice: null,
  entries: [],
  navigate: (page) => set({ page }),
  dismiss: () => set({ error: null, notice: null }),
  disconnected: () =>
    set({
      connection: "error",
      snapshot: null,
      busy: false,
      error:
        "Связь с Python потеряна. Автоматический перезапуск отключён; проверьте черновик перед подключением.",
    }),
  init: async () => {
    if (!isDesktop || get().connection === "connecting") return;
    set({ connection: "connecting", error: null });
    try {
      const snapshot = await connect();
      set({ snapshot, connection: "connected" });
    } catch (e) {
      set({ connection: "error", snapshot: null, error: message(e) });
    }
  },
  sync: async () => {
    if (syncing || get().connection !== "connected") return;
    syncing = true;
    try {
      const snapshot = parseSnapshot(await request("snapshot"));
      const prev = get().snapshot;
      set((s) => ({
        snapshot,
        entries:
          prev?.stage !== snapshot.stage
            ? [
                {
                  id: ++sequence,
                  time: new Date().toLocaleTimeString("ru-RU"),
                  detail: stageLabels[snapshot.stage],
                },
                ...s.entries,
              ].slice(0, 100)
            : s.entries,
      }));
    } catch (e) {
      void request("stop").catch(() => {});
      set({ connection: "error", snapshot: null, error: message(e) });
    } finally {
      syncing = false;
    }
  },
  run: async (operation, data = {}) => {
    if (get().busy) throw new Error("Дождитесь завершения текущей операции");
    if (get().connection !== "connected")
      throw new Error("Python не подключён");
    set({ busy: true, error: null, notice: null });
    try {
      const result = await request(operation, data);
      await get().sync();
      set({ notice: operation === "save" ? "Настройки сохранены" : null });
      return result;
    } catch (e) {
      set({ error: message(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },
  // Emergency stop MUST NOT use run(): it bypasses the UI busy flag.
  stop: async () => {
    try {
      await request("stop");
      await get().sync();
    } catch (e) {
      set({ error: message(e) });
    }
  },
}));
