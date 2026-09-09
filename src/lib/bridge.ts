import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import validateSnapshot from "../generated/snapshot.js";
import type { Operation, Snapshot } from "./contracts";
export const isDesktop = isTauri();
export function parseSnapshot(value: unknown): Snapshot {
  if (!validateSnapshot(value))
    throw new Error(
      "Несовместимый ответ Python. Обновите desktop и адаптер вместе.",
    );
  return value as Snapshot;
}
export async function request(
  operation: Operation,
  data: Record<string, unknown> = {},
): Promise<unknown> {
  if (!isDesktop)
    throw new Error("Управление доступно только в desktop-приложении Tauri.");
  return invoke("backend_request", { operation, data });
}
export async function connect(): Promise<Snapshot> {
  return parseSnapshot(await invoke("backend_connect"));
}
export async function subscribe(
  onChange: () => void,
  onExit: () => void,
): Promise<() => void> {
  const listeners: UnlistenFn[] = [];
  try {
    listeners.push(await listen("backend-state", onChange));
    listeners.push(await listen("backend-exit", onExit));
    return () => listeners.forEach((fn) => fn());
  } catch (e) {
    listeners.forEach((fn) => fn());
    throw e;
  }
}
