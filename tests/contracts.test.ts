import { describe, it, expect } from "vitest";
import validate from "../src/generated/config.js";
import snapshot from "../src/generated/snapshot.js";
import { settingsSchema } from "../src/lib/contracts";
const config = {
  version: 1,
  api_id: "",
  phone: "",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  wpm: 105,
  words: 8,
  active_preset: "natural",
  presets: [{ id: "natural", name: "Естественный", prompts: ["Кратко."] }],
};
const state = {
  protocol: 1,
  config: { ...config, has_api_key: false, has_api_hash: false, warning: "" },
  stage: "idle",
  detail: "Остановлено",
  prepared: false,
  active: false,
  chats: [],
  target: null,
  profile: null,
  hotkeys: true,
  telemetry: [],
};
describe("JSON Schema boundary", () => {
  it("accepts valid config", () => expect(validate(config)).toBe(true));
  it("rejects string speed", () =>
    expect(validate({ ...config, wpm: "105" })).toBe(false));
  it("rejects bounds", () =>
    expect(validate({ ...config, wpm: 301 })).toBe(false));
  it("accepts snapshot", () => expect(snapshot(state)).toBe(true));
  it("rejects protocol drift", () =>
    expect(snapshot({ ...state, protocol: 2 })).toBe(false));
  it("rejects public secrets", () =>
    expect(
      snapshot({ ...state, config: { ...state.config, api_key: "private" } }),
    ).toBe(false));
  it("rejects remote avatars", () =>
    expect(
      snapshot({
        ...state,
        profile: {
          id: 1,
          name: "User",
          username: null,
          avatar: "https://example.org/a",
          avatar_warning: null,
        },
      }),
    ).toBe(false));
});
describe("form validation", () => {
  const v = { ...config, api_key: "", api_hash: "" };
  it("accepts valid values", () =>
    expect(settingsSchema.safeParse(v).success).toBe(true));
  it("rejects external HTTP", () =>
    expect(
      settingsSchema.safeParse({ ...v, base_url: "http://example.org" })
        .success,
    ).toBe(false));
  it("accepts local HTTP", () =>
    expect(
      settingsSchema.safeParse({ ...v, base_url: "http://127.0.0.1:8080/v1" })
        .success,
    ).toBe(true));
  it("rejects credentials in URL", () =>
    expect(
      settingsSchema.safeParse({ ...v, base_url: "https://secret@example.org" })
        .success,
    ).toBe(false));
  it("rejects duplicate presets", () =>
    expect(
      settingsSchema.safeParse({ ...v, presets: [v.presets[0], v.presets[0]] })
        .success,
    ).toBe(false));
});
