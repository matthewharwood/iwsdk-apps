import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { bundleHash, hashFile } from "./hash";
import {
  type Archive,
  BulkMetadataSchema,
  IMPORTER_VERSION,
  type SourceManifest,
  SourceManifestSchema,
} from "./schemas";

const USER_AGENT = "iwsdk-apps-commander-catalog/1 (+https://github.com/matthewharwood/iwsdk-apps)";
const METADATA_URL = "https://api.scryfall.com/bulk-data";
const RULES_URL = "https://magic.wizards.com/en/rules";
const BANS_URL = "https://magic.wizards.com/en/banned-restricted-list";
const POLICY_URL = "https://magic.wizards.com/en/formats/commander";

export interface FetchOptions {
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  onProgress?: (progress: { kind: string; bytes: number; expectedBytes: number | null }) => void;
}

function validRemote(url: string): string {
  const parsed = new URL(url);
  const allowed = [
    "api.scryfall.com",
    "data.scryfall.io",
    "magic.wizards.com",
    "media.wizards.com",
    "www.mtgo.com",
  ];
  if (
    parsed.protocol !== "https:" ||
    !allowed.includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error(`Unapproved source URL: ${url}`);
  }
  return parsed.href;
}

async function request(url: string, options: FetchOptions, redirects = 0): Promise<Response> {
  const fetcher = options.fetch ?? globalThis.fetch;
  for (let attempt = 0; attempt < 3; attempt++) {
    options.signal?.throwIfAborted();
    const signals = [AbortSignal.timeout(120_000)];
    if (options.signal) signals.push(options.signal);
    const response = await fetcher(validRemote(url), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,text/html,*/*;q=0.8",
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.any(signals),
      redirect: "manual",
    });
    if (response.ok) return response;
    await response.body?.cancel();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects >= 4)
        throw new Error(`Invalid or excessive source redirect: ${url}`);
      return request(validRemote(new URL(location, url).href), options, redirects + 1);
    }
    if (response.status !== 429 && response.status < 500)
      throw new Error(`Source HTTP ${response.status}: ${url}`);
    const retry = response.headers.get("retry-after");
    const seconds = retry ? Number(retry) : Number.NaN;
    const wait = retry
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retry) - Date.now()
      : 1000 * 2 ** attempt;
    if (attempt === 2 || !Number.isFinite(wait) || wait > 60_000)
      throw new Error(
        `Source HTTP ${response.status}; retry later (${retry ?? "exhausted"}): ${url}`,
      );
    await delay(Math.max(100, wait), undefined, options.signal ? { signal: options.signal } : {});
  }
  throw new Error("Unreachable retry state");
}

interface DownloadRequest {
  kind: Archive["kind"];
  url: string;
  format: Archive["format"];
  updatedAt?: string;
  expectedBytes?: number;
}

async function download(
  directory: string,
  source: DownloadRequest,
  options: FetchOptions,
): Promise<Archive> {
  const response = await request(source.url, options);
  const encoding = response.headers.get("content-encoding");
  if (encoding && encoding !== "identity") {
    await response.body?.cancel();
    throw new Error(
      `Source ignored identity encoding (${encoding}); cannot attest archive-byte hash`,
    );
  }
  if (!response.body) throw new Error("Source response had no body");
  const headerLength = response.headers.get("content-length");
  const expectedBytes = source.expectedBytes ?? (headerLength ? Number(headerLength) : null);
  const partial = join(directory, "archives", `${randomUUID()}.partial`);
  const file = await open(partial, "wx");
  const digest = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      options.signal?.throwIfAborted();
      bytes += chunk.length;
      if (bytes > 1_000_000_000) throw new Error("Source exceeds 1GB archive limit");
      digest.update(chunk);
      await file.writeFile(chunk);
      options.onProgress?.({ kind: source.kind, bytes, expectedBytes });
    }
    if (expectedBytes !== null && bytes !== expectedBytes)
      throw new Error(`Source length mismatch: ${bytes} != ${expectedBytes}`);
    await file.sync();
    await file.close();
    const sha256 = digest.digest("hex");
    const extension = { json: "json", "gzip-jsonl": "jsonl.gz", text: "txt", html: "html" }[
      source.format
    ];
    const path = `archives/${sha256}.${extension}`;
    const existing = Bun.file(join(directory, path));
    if (await existing.exists()) {
      if ((await hashFile(existing.name ?? join(directory, path))).sha256 !== sha256)
        throw new Error("Existing content-addressed archive is corrupt");
      await rm(partial);
    } else await rename(partial, join(directory, path));
    const text =
      source.kind === "comprehensive-rules" ? await readFile(join(directory, path), "utf8") : "";
    const reported = /These rules are effective as of ([^.]+)\./.exec(text)?.[1];
    if (source.kind === "comprehensive-rules" && !reported)
      throw new Error("Rules source effective-date header missing");
    return {
      kind: source.kind,
      url: source.url,
      resolvedUrl: response.url || source.url,
      retrievedAt: new Date().toISOString(),
      updatedAt: source.updatedAt ?? null,
      effectiveDate: reported ? new Date(reported).toISOString().slice(0, 10) : null,
      contentType: response.headers.get("content-type"),
      httpContentEncoding: encoding,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      expectedBytes,
      bytes,
      sha256,
      hashLayer: "http-entity-identity-encoding",
      format: source.format,
      path,
    };
  } catch (error) {
    await file.close().catch(() => undefined);
    await rm(partial, { force: true });
    throw error;
  }
}

export function commanderSection(html: string): string {
  const match = /<h3[^>]*>\s*Commander Banned Cards\s*<\/h3>([\s\S]*?)<\/section>/.exec(html);
  if (!match?.[1]) throw new Error("Commander banned section missing; policy requires review");
  return match[1];
}

/** Acquisition does not certify rules semantics, historical legality, or executable support. */
export async function fetchSources(
  directoryInput: string,
  options: FetchOptions = {},
): Promise<{ manifestPath: string; manifest: SourceManifest }> {
  const directory = resolve(directoryInput);
  await mkdir(join(directory, "archives"), { recursive: true });
  const archives: Archive[] = [];
  const add = async (source: DownloadRequest) => {
    const archive = await download(directory, source, options);
    archives.push(archive);
    return archive;
  };
  const metadataArchive = await add({ kind: "bulk-metadata", url: METADATA_URL, format: "json" });
  const metadata = BulkMetadataSchema.parse(
    JSON.parse(await readFile(join(directory, metadataArchive.path), "utf8")),
  );
  for (const kind of ["oracle_cards", "default_cards", "rulings"] as const) {
    const item = metadata.data.find((entry) => entry.type === kind);
    if (!item) throw new Error(`Missing required bulk dataset ${kind}`);
    await add({
      kind,
      url: item.jsonl_download_uri,
      format: "gzip-jsonl",
      updatedAt: item.updated_at,
      expectedBytes: item.compressed_size,
    });
  }
  const landing = await add({ kind: "rules-landing", url: RULES_URL, format: "html" });
  const html = await readFile(join(directory, landing.path), "utf8");
  const txtUrl = [...html.matchAll(/href=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .find((url) => url?.includes("MagicCompRules") && url.endsWith(".txt"));
  if (!txtUrl)
    throw new Error("Official rules landing page no longer links a discoverable TXT artifact");
  await add({ kind: "comprehensive-rules", url: new URL(txtUrl, RULES_URL).href, format: "text" });
  await add({ kind: "commander-policy", url: POLICY_URL, format: "html" });
  const bans = await add({ kind: "banned-restricted", url: BANS_URL, format: "html" });
  const section = commanderSection(await readFile(join(directory, bans.path), "utf8"));
  const evidenceUrls = new Set(
    [...section.matchAll(/href=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((url): url is string => Boolean(url?.startsWith("https://magic.wizards.com/"))),
  );
  for (const url of evidenceUrls) await add({ kind: "policy-evidence", url, format: "html" });
  const manifest = SourceManifestSchema.parse({
    schemaVersion: 1,
    importerVersion: IMPORTER_VERSION,
    createdAt: new Date().toISOString(),
    bundleHash: bundleHash(archives),
    archives,
    certification: "source-acquisition-only",
  });
  const manifestPath = join(directory, `manifest-${manifest.bundleHash}.json`);
  if (!(await Bun.file(manifestPath).exists()))
    await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    manifestPath,
    manifest: SourceManifestSchema.parse(await Bun.file(manifestPath).json()),
  };
}

/** Extend a pinned bundle with primary evidence; preserve its original card/rule archives. */
export async function fetchTabletopEligibilityEvidence(
  manifestPathInput: string,
  options: FetchOptions = {},
): Promise<{ manifestPath: string; manifest: SourceManifest }> {
  const manifestPath = resolve(manifestPathInput);
  const prior = SourceManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (bundleHash(prior.archives) !== prior.bundleHash)
    throw new Error("Source bundle hash mismatch");
  const directory = dirname(manifestPath);
  const archives = [...prior.archives];
  for (const url of [
    "https://www.mtgo.com/news/june-2024-vintage-cube-update",
    "https://www.mtgo.com/news/mtgo-blog-05142024",
  ]) {
    if (!archives.some((archive) => archive.url === url))
      archives.push(
        await download(directory, { kind: "policy-evidence", url, format: "html" }, options),
      );
  }
  const manifest = SourceManifestSchema.parse({
    ...prior,
    bundleHash: bundleHash(archives),
    archives,
  });
  const output = join(directory, `manifest-${manifest.bundleHash}.json`);
  if (!(await Bun.file(output).exists()))
    await Bun.write(output, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifestPath: output, manifest };
}
