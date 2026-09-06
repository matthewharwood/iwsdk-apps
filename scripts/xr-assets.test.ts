import { describe, expect, test } from "bun:test";
import { configureLocalXRAssets, localXRAssetURL } from "../apps/web/app/game/scene/xr-assets";

const cdn = "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/";

describe("local XR asset boundary", () => {
  test("rewrites supported Quest controller assets at root and subpath origins", () => {
    expect(localXRAssetURL(`${cdn}meta-quest-touch-plus/left.glb`, "/")).toBe(
      "/xr-profiles/meta-quest-touch-plus/left.glb",
    );
    expect(localXRAssetURL(`${cdn}meta-quest-touch-plus-v2/right.glb`, "/table/")).toBe(
      "/table/xr-profiles/meta-quest-touch-plus-v2/right.glb",
    );
  });
  test("leaves application assets and unrelated hosts alone", () => {
    expect(localXRAssetURL("/assets/table.glb", "/")).toBe("/assets/table.glb");
    expect(localXRAssetURL("data:application/octet-stream;base64,AA==", "/")).toBe(
      "data:application/octet-stream;base64,AA==",
    );
    const other = "https://example.org/model.glb";
    expect(localXRAssetURL(other, "/")).toBe(other);
  });
  test("rejects escaped paths and invalid deployment bases", () => {
    for (const path of [
      "../private",
      "profile/../../private",
      "profile/%2e%2e",
      "profile/left.glb?secret=1",
    ]) {
      expect(() => localXRAssetURL(cdn + path, "/")).toThrow();
    }
    for (const base of ["relative/", "/missing-slash", "/../escape/"]) {
      expect(() => localXRAssetURL(`${cdn}generic-trigger/left.glb`, base)).toThrow();
    }
  });
  test("installs through the public Three.js LoadingManager URL modifier API", () => {
    let modifier: ((url: string) => string) | undefined;
    const manager = {
      setURLModifier(callback?: (url: string) => string) {
        modifier = callback;
        return this;
      },
    };
    configureLocalXRAssets(manager as Parameters<typeof configureLocalXRAssets>[0], "/offline/");
    expect(modifier?.(`${cdn}generic-trigger/right.glb`)).toBe(
      "/offline/xr-profiles/generic-trigger/right.glb",
    );
  });
});
