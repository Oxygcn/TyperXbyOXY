// Does not replace production npm ci / strict tsc / Vitest / Windows integration.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import validate from "../src/generated/config.js";
import snapshot from "../src/generated/snapshot.js";
const c = {
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
assert.equal(validate(c), true);
assert.equal(validate({ ...c, wpm: 301 }), false);
assert.equal(validate({ ...c, wpm: "105" }), false);
assert.equal(validate({ ...c, api_key: "private" }), false);
const s = {
  protocol: 1,
  config: { ...c, has_api_key: false, has_api_hash: false, warning: "" },
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
assert.equal(snapshot(s), true);
assert.equal(snapshot({ ...s, protocol: 2 }), false);
assert.equal(snapshot({ ...s, stage: "unknown" }), false);
assert.equal(
  snapshot({
    ...s,
    profile: {
      id: 1,
      name: "Owner",
      username: null,
      avatar: "https://example.org/a.jpg",
      avatar_warning: null,
    },
  }),
  false,
);
for (const f of ["config", "snapshot"])
  assert.equal(
    /new Function|eval\(/.test(readFileSync(`src/generated/${f}.js`, "utf8")),
    false,
  );
console.log("10 offline schema/CSP assertions passed.");
