import { lookRotation, metaQuest3, XRDevice } from "iwer";

const device = new XRDevice(metaQuest3, { stereoEnabled: false });
device.installRuntime({ forceInstall: true, polyfillLayers: false });
device.controlMode = "programmatic";
device.position.set(0, 1.65, 0.15);
const gaze = lookRotation({ x: 0, y: -0.75, z: -1 });
device.quaternion.set(gaze.x, gaze.y, gaze.z, gaze.w);

export interface XrTestHarness {
  status(): { active: boolean; hasCanvas: boolean; width: number; height: number; inputs: number };
  frames(count: number): Promise<void>;
  selectAt(target: { x: number; y: number; z: number }): Promise<void>;
  exitAt(target: { x: number; y: number; z: number }): Promise<void>;
  end(): Promise<void>;
}

async function aimAt(target: { x: number; y: number; z: number }) {
  const controller = device.controllers.right;
  if (!controller) throw new Error("The emulated right controller is unavailable.");
  controller.connected = true;
  await device.remote.dispatch("set_transform", {
    device: "controller-right",
    position: { x: target.x, y: 1.2, z: 0.3 },
  });
  await device.remote.dispatch("look_at", { device: "controller-right", target });
  await frames(4);
  return controller;
}

async function frames(count: number): Promise<void> {
  const session = device.activeSession;
  if (!session) throw new Error("The emulated XR session is not active.");
  if (!Number.isInteger(count) || count < 1 || count > 60)
    throw new Error("Unsupported test frame count.");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("The XR animation loop stalled.")), 5000);
    let remaining = count;
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) {
        clearTimeout(timeout);
        resolve();
      } else session.requestAnimationFrame(next);
    };
    session.requestAnimationFrame(next);
  });
}

const harness: XrTestHarness = {
  status() {
    const canvas = device.appCanvas;
    return {
      active: Boolean(device.activeSession),
      hasCanvas: Boolean(canvas),
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      inputs: device.inputSources.length,
    };
  },
  frames,
  async selectAt(target) {
    await aimAt(target);
    await device.remote.dispatch("select", { device: "controller-right", duration: 0.1 });
    await frames(3);
  },
  async exitAt(target) {
    const controller = await aimAt(target);
    const session = device.activeSession;
    if (!session) throw new Error("No active XR session can receive the Exit VR press.");
    const ended = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("The in-world Exit VR control did not end the session.")),
        5000,
      );
      session.addEventListener(
        "end",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
    // Releasing via the remote queue after the session ends would wait forever
    // for an XR frame. Press through the queue, then release the physical input.
    try {
      await Promise.all([
        ended,
        device.remote.dispatch("set_select_value", { device: "controller-right", value: 1 }),
      ]);
    } finally {
      controller.updateButtonValue("trigger", 0);
    }
  },
  async end() {
    await device.activeSession?.end();
  },
};

declare global {
  interface Window {
    __xrTest: XrTestHarness;
  }
}
window.__xrTest = harness;
