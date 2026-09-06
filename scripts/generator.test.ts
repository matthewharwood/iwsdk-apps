import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./create-app";
import { createWorkspace, parseWorkspaceArgs, validateName } from "./create-workspace";

let temporaryRoot: string;
let source: string;

async function put(path: string, content: string | Uint8Array): Promise<void> {
  const target = join(source, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "webxr-generator-test-"));
  source = join(temporaryRoot, "source");
  await mkdir(source);
  await put(
    "package.json",
    JSON.stringify({
      name: "fixture-stack",
      private: true,
      workspaces: ["apps/*", "packages/*"],
    }),
  );
  await put(
    "apps/web/package.json",
    JSON.stringify({
      name: "@fixture-stack/web",
      dependencies: { "@fixture-stack/domain": "workspace:*", "@iwsdk/core": "0.2.0" },
    }),
  );
  await put(
    "apps/web/app/app.config.ts",
    'export const appConfig = { appId: "@fixture-stack/web", title: "Working Example" };\n',
  );
  await put("apps/web/app/index.ts", 'import { create } from "@fixture-stack/domain";\n');
  await put("packages/domain/package.json", '{"name":"@fixture-stack/domain"}');
  await put(".agents/skills/iwsdk/SKILL.md", "# IWSDK\nUse @fixture-stack/domain boundaries.\n");
  await put("README.md", "# Example\nUse @fixture-stack/web\n");
  await put(".gitignore", "node_modules/\n.generated/\n");
  await put(
    "bun.lock",
    JSON.stringify({
      lockfileVersion: 1,
      workspaces: {
        "": { name: "fixture-stack" },
        "apps/web": { name: "@fixture-stack/web" },
        "apps/other": { name: "@fixture-stack/other" },
        "packages/domain": { name: "@fixture-stack/domain" },
      },
      packages: { "@fixture-stack/other": ["@fixture-stack/other@workspace:apps/other"] },
    }),
  );
});

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("application generator", () => {
  test("copies the canonical app and gives its database and owner lock an independent identity", async () => {
    const destination = await createApp({ workspaceRoot: source, name: "solar-table" });
    const manifest = JSON.parse(await readFile(join(destination, "package.json"), "utf8"));
    expect(manifest.name).toBe("@fixture-stack/solar-table");
    expect(manifest.dependencies["@fixture-stack/domain"]).toBe("workspace:*");
    expect(manifest.dependencies["@iwsdk/core"]).toBe("0.2.0");
    expect(await readFile(join(destination, "app/app.config.ts"), "utf8")).toContain(
      'appId: "@fixture-stack/solar-table"',
    );
    expect(await readFile(join(destination, "app/app.config.ts"), "utf8")).toContain(
      'title: "Solar Table"',
    );
    expect(await readFile(join(source, "apps/web/app/app.config.ts"), "utf8")).toContain(
      'title: "Working Example"',
    );
  });

  test("rejects path traversal, invalid and platform-reserved names before writing", async () => {
    for (const name of [
      "../escape",
      "a/b",
      "a\\b",
      "Uppercase",
      "--arg",
      "a--b",
      "a-",
      "con",
      "nul",
      "",
      "a".repeat(64),
    ]) {
      await expect(createApp({ workspaceRoot: source, name })).rejects.toThrow();
    }
    expect(await readdir(join(source, "apps"))).toEqual(["web"]);
  });

  test("refuses both existing empty directories and the source app", async () => {
    await mkdir(join(source, "apps/existing"));
    await expect(createApp({ workspaceRoot: source, name: "existing" })).rejects.toThrow();
    await expect(createApp({ workspaceRoot: source, name: "web" })).rejects.toThrow();
    expect(await exists(join(source, "apps/existing"))).toBe(true);
    expect(await exists(join(source, "apps/web/package.json"))).toBe(true);
  });

  test("allows only one concurrent generation of the same name", async () => {
    const results = await Promise.allSettled([
      createApp({ workspaceRoot: source, name: "parallel" }),
      createApp({ workspaceRoot: source, name: "parallel" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await exists(join(source, "apps/parallel/package.json"))).toBe(true);
  });

  test("does not copy credentials, environments, user databases or generated artifacts", async () => {
    for (const path of [
      ".env",
      ".env.local",
      ".env.production",
      ".npmrc",
      "node_modules/example/index.js",
      ".generated/xr-emulator.js",
      "dist/index.html",
      "public/litert/wasm/runtime.wasm",
      "public/sqlite/sqlite.wasm",
      "saved.db",
      "saved.sqlite3-wal",
      "private.pem",
    ]) {
      await put(`apps/web/${path}`, "local-only");
    }
    await put("apps/web/.env.example", "VITE_TITLE=Example\n");
    const destination = await createApp({ workspaceRoot: source, name: "clean" });
    for (const path of [
      ".env",
      ".env.local",
      ".env.production",
      ".npmrc",
      "node_modules",
      ".generated",
      "dist",
      "public/litert",
      "public/sqlite",
      "saved.db",
      "saved.sqlite3-wal",
      "private.pem",
    ]) {
      expect(await exists(join(destination, path))).toBe(false);
    }
    expect(await readFile(join(destination, ".env.example"), "utf8")).toBe("VITE_TITLE=Example\n");
    expect(await readFile(join(source, "apps/web/.env"), "utf8")).toBe("local-only");
  });

  test("copies binary assets without interpreting them as source code", async () => {
    const bytes = new Uint8Array([0, 255, 128, 13, 10]);
    await put("apps/web/public/texture.png", bytes);
    const destination = await createApp({ workspaceRoot: source, name: "texture" });
    expect(new Uint8Array(await readFile(join(destination, "public/texture.png")))).toEqual(bytes);
  });

  test("rolls back only its own new output when a source symlink is encountered", async () => {
    const outside = join(temporaryRoot, "private.txt");
    await writeFile(outside, "private");
    await symlink(outside, join(source, "apps/web/linked.txt"));
    await expect(createApp({ workspaceRoot: source, name: "linked" })).rejects.toThrow(
      "symbolic link",
    );
    expect(await exists(join(source, "apps/linked"))).toBe(false);
    expect(await readFile(outside, "utf8")).toBe("private");
  });

  test("rejects an apps symlink outside the workspace", async () => {
    const outside = join(temporaryRoot, "outside-apps");
    await mkdir(outside);
    await rm(join(source, "apps"), { recursive: true });
    await symlink(outside, join(source, "apps"));
    await expect(createApp({ workspaceRoot: source, name: "escape" })).rejects.toThrow(
      "inside the workspace",
    );
    expect(await readdir(outside)).toEqual([]);
  });
});

describe("independent workspace generator", () => {
  test("includes the optional headless CLI with the new scope and excludes source catalogs and reference studio", async () => {
    await put("apps/engine-cli/package.json", '{"name":"@fixture-stack/engine-cli"}');
    await put("apps/engine-cli/src/index.ts", 'import "@fixture-stack/domain";');
    await put(".commander/catalog.sqlite", "private catalog");
    await put("apps/printable-card-studio/reference.html", "reference");
    const destination = await createWorkspace({
      sourceRoot: source,
      destination: join(temporaryRoot, "engine-starter"),
    });
    expect(await readFile(join(destination, "apps/engine-cli/src/index.ts"), "utf8")).toContain(
      "@engine-starter/domain",
    );
    expect(await exists(join(destination, ".commander"))).toBe(false);
    expect(await exists(join(destination, "apps/printable-card-studio"))).toBe(false);
  });
  test("creates a named standalone Turborepo with skills and only the canonical app", async () => {
    await put("apps/other/package.json", '{"name":"@fixture-stack/other"}');
    await put("firebase.json", '{"hosting":{}}');
    await put(".firebaserc", '{"projects":{"default":"existing-service"}}');
    await put(".env", "EXAMPLE_SECRET=private");
    await put("local-notes.md", "Not part of the reusable starter");
    const destination = await createWorkspace({
      sourceRoot: source,
      destination: join(temporaryRoot, "lunar-tools"),
    });
    expect(JSON.parse(await readFile(join(destination, "package.json"), "utf8")).name).toBe(
      "lunar-tools",
    );
    expect(await readFile(join(destination, "apps/web/app/app.config.ts"), "utf8")).toContain(
      'appId: "@lunar-tools/web"',
    );
    expect(await readFile(join(destination, ".agents/skills/iwsdk/SKILL.md"), "utf8")).toContain(
      "@lunar-tools/domain",
    );
    expect(await readdir(join(destination, "apps"))).toEqual(["web"]);
    const lock = JSON.parse(await readFile(join(destination, "bun.lock"), "utf8"));
    expect(lock.workspaces[""].name).toBe("lunar-tools");
    expect(lock.workspaces["apps/other"]).toBeUndefined();
    expect(lock.packages["@lunar-tools/other"]).toBeUndefined();
    for (const path of ["firebase.json", ".firebaserc", ".env", "local-notes.md"]) {
      expect(await exists(join(destination, path))).toBe(false);
    }
  });

  test("generated workspaces remain valid generator sources", async () => {
    const first = await createWorkspace({
      sourceRoot: source,
      destination: join(temporaryRoot, "first"),
    });
    const app = await createApp({ workspaceRoot: first, name: "second-app" });
    expect(JSON.parse(await readFile(join(app, "package.json"), "utf8")).name).toBe(
      "@first/second-app",
    );
    const second = await createWorkspace({
      sourceRoot: first,
      destination: join(temporaryRoot, "second"),
    });
    expect(
      JSON.parse(await readFile(join(second, "apps/web/package.json"), "utf8")).dependencies[
        "@second/domain"
      ],
    ).toBe("workspace:*");
  });

  test("cannot overwrite an existing output or any ancestor of the source", async () => {
    await expect(createWorkspace({ sourceRoot: source, destination: source })).rejects.toThrow();
    await expect(
      createWorkspace({ sourceRoot: source, destination: temporaryRoot, name: "valid-name" }),
    ).rejects.toThrow();
    const existing = join(temporaryRoot, "existing");
    await mkdir(existing);
    await writeFile(join(existing, "keep.txt"), "keep");
    await expect(createWorkspace({ sourceRoot: source, destination: existing })).rejects.toThrow(
      "already exists",
    );
    expect(await readFile(join(existing, "keep.txt"), "utf8")).toBe("keep");
  });

  test("rejects outputs inside copied source directories, including symlinked parents", async () => {
    await expect(
      createWorkspace({ sourceRoot: source, destination: join(source, "packages/nested") }),
    ).rejects.toThrow("outside");
    await symlink(join(source, "packages"), join(temporaryRoot, "alias"));
    await expect(
      createWorkspace({ sourceRoot: source, destination: join(temporaryRoot, "alias/nested") }),
    ).rejects.toThrow("outside");
  });

  test("requires a canonical app config instead of silently creating an incomplete workspace", async () => {
    await rm(join(source, "apps/web/app/app.config.ts"));
    const destination = join(temporaryRoot, "missing");
    await expect(createWorkspace({ sourceRoot: source, destination })).rejects.toThrow(
      "template is missing",
    );
    expect(await exists(destination)).toBe(false);
  });

  test("fails closed on private key material inside an allowlisted source file", async () => {
    await put("packages/secret.ts", ["-----BEGIN", "PRIVATE KEY-----"].join(" "));
    const destination = join(temporaryRoot, "secret");
    await expect(createWorkspace({ sourceRoot: source, destination })).rejects.toThrow(
      "Private key material",
    );
    expect(await exists(destination)).toBe(false);
  });
});

test("CLI parsing accepts explicit names but rejects unknown or incomplete arguments", () => {
  expect(parseWorkspaceArgs(["../demo"])).toEqual({ destination: "../demo" });
  expect(parseWorkspaceArgs(["--", "../A Folder", "--name", "demo"])).toEqual({
    destination: "../A Folder",
    name: "demo",
  });
  for (const args of [
    [],
    ["--name", "demo"],
    ["demo", "--name"],
    ["demo", "--force"],
    ["demo", "extra"],
  ]) {
    expect(() => parseWorkspaceArgs(args)).toThrow("Usage");
  }
  expect(validateName("webxr-2")).toBe("webxr-2");
  expect(validateName("a".repeat(63))).toBe("a".repeat(63));
});
