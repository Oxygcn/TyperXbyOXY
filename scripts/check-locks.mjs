import { readFileSync, existsSync } from "node:fs";
for (const file of [
  "package-lock.json",
  "src-tauri/Cargo.lock",
  "bridge/requirements.lock",
])
  if (!existsSync(file))
    throw new Error(
      `Missing ${file}; run scripts/bootstrap.ps1 with network, review and commit locks. Release blocked.`,
    );
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
if (lock.lockfileVersion !== 3) throw new Error("Expected npm lockfile v3");
for (const kind of ["dependencies", "devDependencies"])
  for (const [name, version] of Object.entries(pkg[kind]))
    if (
      lock.packages?.[""]?.[kind]?.[name] !== version ||
      !lock.packages?.[`node_modules/${name}`]
    )
      throw new Error(`Unresolved dependency: ${name}`);
console.log("Reviewed locks present; direct npm pins match.");
