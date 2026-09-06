import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, normalizePath, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function iwsdkStartClient(): Plugin {
  const entry = normalizePath(fileURLToPath(new URL("./app/client.tsx", import.meta.url)));
  return {
    name: "iwsdk-start-client",
    apply: "serve",
    enforce: "pre",
    transform(code, id, options) {
      if (!options?.ssr && normalizePath(id.split("?")[0] ?? "") === entry) {
        // Start renders its HTML itself, so Vite's transformIndexHtml injection
        // is not invoked. Load the official plugin runtime before hydration.
        return { code: `import "/@iwer-injection-runtime";\n${code}`, map: null };
      }
    },
  };
}

export default defineConfig(async ({ command }) => {
  const base = process.env.BASE_PATH || "/";
  if (!base.startsWith("/") || !base.endsWith("/") || base.includes("..")) {
    throw new Error("BASE_PATH must be an absolute path with a trailing slash.");
  }
  const quest = command === "serve" && process.env.XR_DEV === "true";
  const cert = process.env.XR_CERT;
  const key = process.env.XR_KEY;
  if (quest && (!cert || !key))
    throw new Error("Set XR_CERT and XR_KEY to trusted TLS certificate files. See docs/quest.md.");
  return {
    base,
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-router", "three", "@preact/signals-core"],
    },
    optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
    worker: { format: "es" as const },
    server: {
      strictPort: true,
      ...(quest && cert && key
        ? { https: { cert: readFileSync(cert), key: readFileSync(key) } }
        : {}),
    },
    plugins: [
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart({
        srcDirectory: "app",
        spa: { enabled: true, prerender: { outputPath: "/index" } },
        prerender: { enabled: true, crawlLinks: true, autoSubfolderIndex: true, failOnError: true },
      }),
      react({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
      ...(quest
        ? [
            (await import("@iwsdk/vite-plugin-dev")).iwsdkDev({
              emulator: { device: "metaQuest3", injectOnBuild: false },
            }),
            iwsdkStartClient(),
          ]
        : []),
    ],
  };
});
