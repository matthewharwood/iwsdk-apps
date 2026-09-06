import { access, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyTemplatePath,
  createNewDirectory,
  formatGeneratedSource,
  isWithin,
  readWorkspaceName,
  rewriteAppConfig,
  titleFromName,
  validateName,
} from "./create-workspace.ts";

export interface CreateAppOptions {
  workspaceRoot?: string;
  name: string;
}

export async function createApp(options: CreateAppOptions): Promise<string> {
  const name = validateName(options.name);
  const root = await realpath(
    options.workspaceRoot ?? fileURLToPath(new URL("..", import.meta.url)),
  );
  const appsRoot = await realpath(join(root, "apps"));
  if (!isWithin(root, appsRoot))
    throw new Error("The apps directory must stay inside the workspace.");
  const sourceRoot = await realpath(join(appsRoot, "web"));
  if (!isWithin(appsRoot, sourceRoot)) throw new Error("The canonical app must stay inside apps.");
  await access(join(sourceRoot, "app/app.config.ts"));
  const scope = await readWorkspaceName(root);
  const destination = join(appsRoot, name);
  await createNewDirectory(destination, async () => {
    await copyTemplatePath({
      sourceRoot,
      destinationRoot: destination,
      sourcePath: ".",
      transform(text, path) {
        let next = text.replaceAll(`@${scope}/web`, `@${scope}/${name}`);
        if (path === join("app", "app.config.ts")) {
          next = rewriteAppConfig(next, `@${scope}/${name}`, titleFromName(name));
        }
        return next;
      },
    });
    await formatGeneratedSource(root, destination, root);
  });
  return destination;
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2).filter((value) => value !== "--");
    if (args.length !== 1 || !args[0]) throw new Error("Usage: bun run gen:app <kebab-name>");
    const destination = await createApp({ name: args[0] });
    console.info(
      `Created ${destination}\nNext: bun install && bunx turbo run dev --filter=@${await readWorkspaceName(fileURLToPath(new URL("..", import.meta.url)))}/${args[0]}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
