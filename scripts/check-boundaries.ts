import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const failures: string[] = [];
async function files(path: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (
      [
        "node_modules",
        "dist",
        ".turbo",
        ".tanstack",
        "storybook-static",
        "test-results",
        "playwright-report",
      ].includes(entry.name)
    )
      continue;
    const target = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await files(target)));
    else if (/\.(ts|tsx|json)$/.test(entry.name)) result.push(target);
  }
  return result;
}
const paths = [...(await files("apps")), ...(await files("packages"))];
for (const path of paths) {
  const text = await readFile(path, "utf8");
  if (path.endsWith(".test.ts") || path.includes("/tests/") || path.endsWith(".stories.tsx"))
    continue;
  const imports = [...text.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)].map(
    (match) => match[1] ?? "",
  );
  for (const source of imports) {
    if (/^(firebase|@firebase|idb|pixi\.js|animejs)(\/|$)/.test(source))
      failures.push(`${path}: retired runtime import ${source}`);
    if (
      path.startsWith("packages/game-core/") &&
      /^(react|jotai|three|@iwsdk\/(core|xr-input|locomotor)|@sqlite)|\/storage-sqlite(?:\/|$)/.test(
        source,
      )
    )
      failures.push(`${path}: impure game-core import ${source}`);
    if (
      /\/app\/(ui|routes|game\/scene)\//.test(path) &&
      /storage-sqlite|sqlite-wasm|game-core/.test(source)
    )
      failures.push(`${path}: presentation bypasses session boundary ${source}`);
  }
  if (path.endsWith("package.json")) {
    const manifest = JSON.parse(text);
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      if (/^(firebase|firebase-tools|@firebase\/|idb$|pixi\.js$|animejs$)/.test(name))
        failures.push(`${path}: retired dependency ${name}`);
    }
  }
  if (
    path.startsWith("packages/game-core/src/") &&
    /\b(Date\.now|Math\.random|document\.|window\.|navigator\.)/.test(text)
  )
    failures.push(`${path}: nondeterministic or browser-global rules`);
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(`Local-state boundaries checked across ${paths.length} source/config files.`);
