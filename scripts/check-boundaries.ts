import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import tseslint from "typescript-eslint";

const failures: string[] = [];
function hasImpureRules(text: string): boolean {
  const { ast } = tseslint.parser.parseForESLint(text);
  function visit(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(visit);
    const node = value as Record<string, unknown>;
    if (
      node.type === "Identifier" &&
      ["document", "window", "navigator"].includes(String(node.name))
    )
      return true;
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const callee = node.callee as Record<string, unknown>;
      if (
        callee.type === "Identifier" &&
        ["fetch", "eval", "Function", "Date"].includes(String(callee.name))
      )
        return true;
    }
    if (node.type === "MemberExpression") {
      const object = node.object as Record<string, unknown>;
      const property = node.property as Record<string, unknown>;
      const key = property.name ?? property.value;
      if (
        object.type === "Identifier" &&
        ((object.name === "Date" && key === "now") || (object.name === "Math" && key === "random"))
      )
        return true;
    }
    return Object.values(node).some(visit);
  }
  return visit(ast);
}
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
        "printable-card-studio",
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
    if (
      path.startsWith("packages/engine/src/") &&
      !source.startsWith(".") &&
      !["@iwsdk-apps/contracts", "@iwsdk-apps/rule-selection"].includes(source)
    )
      failures.push(
        `${path}: Commander rules may import only local modules, contracts and the pure selector, found ${source}`,
      );
    if (path.startsWith("packages/contracts/src/") && !source.startsWith(".") && source !== "zod")
      failures.push(`${path}: protocol may import only local modules and Zod, found ${source}`);
    if (
      path.startsWith("packages/rule-selection/src/") &&
      !source.startsWith(".") &&
      source !== "zod"
    )
      failures.push(`${path}: selector must remain portable and pure, found ${source}`);
    if (path.endsWith("packages/simulation/src/driver.ts") && /storage|engine/.test(source))
      failures.push(
        `${path}: driver may not read the privileged engine or persistence state ${source}`,
      );
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
    (path.startsWith("packages/game-core/src/") ||
      path.startsWith("packages/engine/src/") ||
      path.startsWith("packages/rule-selection/src/")) &&
    hasImpureRules(text)
  )
    failures.push(`${path}: nondeterministic or browser-global rules`);
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(`Local-state boundaries checked across ${paths.length} source/config files.`);
