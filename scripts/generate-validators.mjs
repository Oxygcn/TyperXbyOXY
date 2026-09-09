// Build-time Ajv compilation: the WebView never requires unsafe-eval.
import Ajv from "ajv";
import standalone from "ajv/dist/standalone/index.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  code: { source: true, esm: true },
});
await mkdir("src/generated", { recursive: true });
for (const name of ["config", "snapshot"]) {
  const schema = JSON.parse(
    await readFile(`bridge/${name}.schema.json`, "utf8"),
  );
  const validate = ajv.compile(schema);
  let source = standalone(ajv, validate);
  // Ajv emits CJS helper imports even in ESM mode. Convert its single known
  // Unicode-length runtime helper to a native ESM import; fail on anything else.
  source = source.replace(
    /const (func\d+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/g,
    'import $1Module from "ajv/dist/runtime/ucs2length.js"; const $1 = $1Module.default ?? $1Module;',
  );
  if (source.includes("require("))
    throw new Error("Unhandled Ajv runtime import");
  await writeFile(`src/generated/${name}.js`, source);
  await writeFile(
    `src/generated/${name}.d.ts`,
    'import type {ValidateFunction} from "ajv"; declare const validate: ValidateFunction; export default validate;\n',
  );
}
