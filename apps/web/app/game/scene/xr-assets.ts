import type { LoadingManager } from "three";

export const XR_ASSET_PACKAGE_VERSION = "1.0.19";
export const XR_PROFILE_IDS = [
  "meta-quest-touch-plus-v2",
  "meta-quest-touch-plus",
  "meta-quest-touch-pro",
  "generic-trigger-squeeze-thumbstick",
  "generic-trigger",
  "generic-hand",
] as const;

const PROFILE_CDN = "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/";

/** SDK controller assets follow the same secure origin and asset cache as the app. */
export function localXRAssetURL(url: string, basePath: string): string {
  if (!url.startsWith(PROFILE_CDN)) return url;
  if (!basePath.startsWith("/") || !basePath.endsWith("/") || basePath.includes("..")) {
    throw new Error("XR asset base path must be an absolute path ending in '/'.");
  }
  const path = url.slice(PROFILE_CDN.length);
  if (!/^[a-z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(path) || path.includes("..")) {
    throw new Error("The controller asset URL contains an unsupported path.");
  }
  // Unsupported profiles fail locally instead of silently creating a CDN dependency.
  return `${basePath}xr-profiles/${path}`;
}

export function configureLocalXRAssets(
  manager: Pick<LoadingManager, "setURLModifier">,
  basePath: string,
): void {
  manager.setURLModifier((url) => localXRAssetURL(url, basePath));
}
