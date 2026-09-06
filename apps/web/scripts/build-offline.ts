import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

// Runs AFTER Start prerendering. This cache contains replaceable assets only.
const directory = "dist/client";
const base = process.env.BASE_PATH || "/";
const files: string[] = [];
async function visit(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) await visit(target);
    else if (!entry.name.endsWith(".map") && entry.name !== "sw.js" && !target.includes("/litert/"))
      files.push(relative(directory, target).replaceAll("\\", "/"));
  }
}
await visit(directory);
files.sort();
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile(join(directory, file)));
const version = hash.digest("hex").slice(0, 16);
const prefix = `local-xr-assets:${base}:`;
const cacheName = `${prefix}${version}`;
await writeFile(
  join(directory, "sw.js"),
  `
const CACHE = ${JSON.stringify(cacheName)};
const PREFIX = ${JSON.stringify(prefix)};
const BASE = ${JSON.stringify(base)};
const ASSETS = ${JSON.stringify(files.map((file) => base + file))};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
// No skipWaiting: a running session retains its current compatible application.
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') return (await cache.match(BASE + 'index.html')) || fetch(event.request);
    return (await cache.match(event.request, {ignoreSearch: true, ignoreVary: true})) || fetch(event.request);
  })());
});
`,
);
console.log(`Offline shell ${version}: ${files.length} local assets. No model cached by default.`);
