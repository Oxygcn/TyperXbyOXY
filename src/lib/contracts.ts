import { z } from "zod";
export type Preset = { id: string; name: string; prompts: string[] };
export type Config = {
  version: 1;
  api_id: string;
  phone: string;
  base_url: string;
  model: string;
  wpm: number;
  words: number;
  active_preset: string;
  presets: Preset[];
  has_api_key: boolean;
  has_api_hash: boolean;
  warning: string;
};
export type Chat = {
  id: number;
  name: string;
  can_reply: boolean;
  peer_id: number;
};
export type PreviewMessage = {
  id: number;
  sender_id: number;
  name: string;
  outgoing: boolean;
  text: string;
};
export const selectResult = z.object({
  selected: z.number(),
  kind: z.enum(["user", "group"]),
  focus: z.object({ id: z.number(), name: z.string() }).nullable(),
  messages: z.array(
    z.object({
      id: z.number(),
      sender_id: z.number(),
      name: z.string(),
      outgoing: z.boolean(),
      text: z.string(),
    }),
  ),
});
export const focusResult = z.object({
  focus: z.object({ id: z.number(), name: z.string() }),
});
export type Profile = {
  id: number;
  name: string;
  username: string | null;
  avatar: string | null;
  avatar_warning: string | null;
};
export type Stage =
  "idle" | "ready" | "listening" | "incoming" | "thinking" | "typing" | "error";
export type Snapshot = {
  protocol: 1;
  config: Config;
  stage: Stage;
  detail: string;
  prepared: boolean;
  active: boolean;
  chats: Chat[];
  target: Chat | null;
  profile: Profile | null;
  hotkeys: boolean;
  telemetry: { minute: number; incoming: number; completed: number }[];
};
export type Operation =
  | "snapshot"
  | "save"
  | "code"
  | "login"
  | "logout"
  | "chats"
  | "select"
  | "focus"
  | "test"
  | "prepare"
  | "stop"
  | "profile";
export const stageLabels: Record<Stage, string> = {
  idle: "Остановлено",
  ready: "Готово к F8",
  listening: "Ожидание сообщения",
  incoming: "Новое сообщение",
  thinking: "Генерация ответа",
  typing: "Печать",
  error: "Ошибка движка",
};
export const loginResult = z.object({
  authorized: z.boolean().optional(),
  code_sent: z.boolean().optional(),
  password_needed: z.boolean().optional(),
});
export function publicToEditable(c: Config) {
  const {
    has_api_key: _key,
    has_api_hash: _hash,
    warning: _warning,
    ...rest
  } = c;
  return rest;
}
export const settingsSchema = z
  .object({
    api_id: z.string().regex(/^\d*$/, "Только цифры").max(20),
    phone: z.string().max(40),
    api_hash: z
      .string()
      .max(128)
      .refine(
        (s) => !s || /^[a-fA-F0-9]{32}$/.test(s),
        "api_hash: 32 шестнадцатеричных символа",
      ),
    api_key: z.string().max(2048),
    base_url: z
      .url()
      .max(500)
      .refine((s) => {
        try {
          const u = new URL(s);
          return (
            !u.username &&
            !u.password &&
            !u.search &&
            !u.hash &&
            (u.protocol === "https:" ||
              (u.protocol === "http:" &&
                ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))
          );
        } catch {
          return false;
        }
      }, "HTTPS обязателен; HTTP — только localhost"),
    model: z.string().max(120),
    wpm: z.number().int().min(25).max(300),
    words: z.number().int().min(1).max(16),
    active_preset: z.string().min(1),
    presets: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          name: z.string().trim().min(1).max(80),
          prompts: z.array(z.string().trim().min(1).max(6000)).min(1).max(8),
        }),
      )
      .min(1)
      .max(30),
  })
  .refine(
    (v) => v.presets.some((p) => p.id === v.active_preset),
    "Выберите существующий пресет",
  )
  .refine(
    (v) => new Set(v.presets.map((p) => p.id)).size === v.presets.length,
    "ID пресетов должны быть уникальны",
  );
export type SettingsValues = z.infer<typeof settingsSchema>;
