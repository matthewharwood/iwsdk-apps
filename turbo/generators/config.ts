import type { PlopTypes } from "@turbo/gen";
import { createApp } from "../../scripts/create-app.ts";
import { validateName } from "../../scripts/create-workspace.ts";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("app", {
    description: "Create a local WebXR app from the canonical apps/web example",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Application name (kebab-case):",
        validate(value: string) {
          try {
            validateName(value);
            return true;
          } catch (error) {
            return error instanceof Error ? error.message : "Invalid application name.";
          }
        },
      },
    ],
    actions: [
      async (answers) => {
        if (typeof answers?.name !== "string") throw new Error("An application name is required.");
        return createApp({ name: answers.name });
      },
    ],
  });
}
