import {
  AssetManager,
  createSystem,
  Hovered,
  Pressed,
  RayInteractable,
  ReferenceSpaceType,
  SessionMode,
  World,
} from "@iwsdk/core";
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
} from "three";
import type { SessionSnapshot } from "../session/local-session";
import { configureLocalXRAssets } from "./xr-assets";

type SceneActions = {
  onTake: (take: 1 | 2 | 3) => void;
  onRestart: () => void;
  onStatus: (status: string) => void;
  onImmersive: (immersive: boolean) => void;
};
export interface TableScene {
  update(snapshot: SessionSnapshot): void;
  supportsVR(): Promise<boolean>;
  enterVR(): Promise<void>;
  destroy(): void;
}

function textSurface(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas text is unavailable.");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return {
    context,
    texture,
    draw(text: string, background: string, foreground: string) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      context.fillStyle = foreground;
      context.font = `500 ${Math.round(height * 0.3)}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, width / 2, height / 2);
      texture.needsUpdate = true;
    },
  };
}

export async function createTable(
  container: HTMLDivElement,
  actions: SceneActions,
): Promise<TableScene> {
  const world = await World.create(container, {
    xr: {
      sessionMode: SessionMode.ImmersiveVR,
      offer: "none",
      referenceSpace: ReferenceSpaceType.LocalFloor,
      features: { handTracking: true, layers: false },
    },
    render: {
      near: 0.05,
      far: 30,
      fov: 42,
      camera: { position: [0, 3.45, 1.2], lookAt: [0, 0.6, -0.9] },
    },
    input: { canvasPointerEvents: true },
    features: { locomotion: false, grabbing: false, physics: false, spatialUI: false },
  });
  try {
    configureLocalXRAssets(AssetManager.loadingManager, import.meta.env.BASE_URL);
    let destroyed = false;
    let requestingXR = false;
    let snapshot: SessionSnapshot | null = null;
    let lastRevision = "";
    const owned = new Group();
    owned.name = "local-table";
    world.createTransformEntity(owned);
    world.scene.background = new Color("#1b2420");
    const ambient = new AmbientLight(0xc7decf, 2);
    owned.add(ambient);
    const light = new DirectionalLight(0xfff1d8, 3);
    light.position.set(-2, 5, 2);
    owned.add(light);
    const table = new Mesh(
      new BoxGeometry(2.4, 0.1, 1.9),
      new MeshStandardMaterial({ color: 0x2e4637, roughness: 0.95 }),
    );
    table.position.set(0, 0.69, -1);
    owned.add(table);
    const edge = new Mesh(
      new BoxGeometry(2.5, 0.12, 2),
      new MeshStandardMaterial({ color: 0x111c16, roughness: 0.85 }),
    );
    edge.position.set(0, 0.62, -1);
    owned.add(edge);
    const floor = new Mesh(
      new PlaneGeometry(200, 200),
      new MeshStandardMaterial({ color: 0x1b2420, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    owned.add(floor);
    const tokenGeometry = new CylinderGeometry(0.105, 0.105, 0.075, 40);
    const tokens = Array.from({ length: 15 }, (_, index) => {
      const material = new MeshStandardMaterial({
        color: index % 3 === 0 ? 0xc1d6a1 : 0x93c9a6,
        roughness: 0.42,
        metalness: 0.08,
      });
      const token = new Mesh(tokenGeometry, material);
      token.position.set(((index % 5) - 2) * 0.34, 0.785, -1.25 + Math.floor(index / 5) * 0.31);
      owned.add(token);
      return token;
    });
    const textures: Texture[] = [];
    const label = textSurface(1024, 192);
    textures.push(label.texture);
    const labelMesh = new Mesh(
      new PlaneGeometry(1.55, 0.29),
      new MeshBasicMaterial({ map: label.texture }),
    );
    labelMesh.position.set(0, 0.751, -1.67);
    labelMesh.rotation.x = -Math.PI / 2;
    owned.add(labelMesh);
    const buttons: Array<{
      mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
      take: 1 | 2 | 3;
      surface: ReturnType<typeof textSurface>;
    }> = [];
    for (const take of [1, 2, 3] as const) {
      const surface = textSurface(256, 112);
      surface.draw(`TAKE ${take}`, "#badbc0", "#17241b");
      textures.push(surface.texture);
      const mesh = new Mesh(
        new PlaneGeometry(0.48, 0.21),
        new MeshBasicMaterial({ map: surface.texture }),
      );
      mesh.position.set((take - 2) * 0.55, 0.77, -0.35);
      mesh.rotation.x = -Math.PI / 2;
      mesh.name = `take-${take}`;
      world
        .createTransformEntity(mesh, { parent: world.sceneEntity })
        .addComponent(RayInteractable);
      buttons.push({ mesh, take, surface });
    }
    const restartSurface = textSurface(512, 100);
    textures.push(restartSurface.texture);
    const restart = new Mesh(
      new PlaneGeometry(0.65, 0.125),
      new MeshBasicMaterial({ map: restartSurface.texture }),
    );
    restart.position.set(-0.52, 0.78, -0.075);
    restart.rotation.x = -Math.PI / 2;
    restart.name = "restart";
    world.createTransformEntity(restart).addComponent(RayInteractable);
    const exitSurface = textSurface(512, 100);
    exitSurface.draw("EXIT VR", "#243b2d", "#badbc0");
    textures.push(exitSurface.texture);
    const exit = new Mesh(
      new PlaneGeometry(0.65, 0.125),
      new MeshBasicMaterial({ map: exitSurface.texture }),
    );
    exit.position.set(0.52, 0.78, -0.075);
    exit.rotation.x = -Math.PI / 2;
    exit.name = "exit";
    world.createTransformEntity(exit).addComponent(RayInteractable);
    let confirmRestart = false;
    class TableInput extends createSystem({ choices: { required: [RayInteractable] } }) {
      private pressed = new Set<number>();
      update() {
        for (const entity of this.queries.choices.entities) {
          const object = entity.object3D;
          if (!object) continue;
          const down = entity.hasComponent(Pressed);
          const fresh = down && !this.pressed.has(entity.index);
          if (down) this.pressed.add(entity.index);
          else this.pressed.delete(entity.index);
          if (object instanceof Mesh && object.material instanceof MeshBasicMaterial)
            object.material.color.setScalar(entity.hasComponent(Hovered) ? 1.18 : 1);
          if (fresh && object === exit && world.session) world.exitXR();
          if (!fresh || snapshot?.status !== "ready") continue;
          const choice = buttons.find((button) => button.mesh === object);
          if (
            choice &&
            snapshot.game?.turn === "human" &&
            !snapshot.game.winner &&
            !snapshot.aiThinking &&
            snapshot.game.remaining >= choice.take
          ) {
            confirmRestart = false;
            actions.onTake(choice.take);
          }
          if (object === restart) {
            if (!snapshot.game?.history.length || snapshot.game.winner || confirmRestart) {
              confirmRestart = false;
              actions.onRestart();
            } else {
              confirmRestart = true;
              restartSurface.draw("CONFIRM NEW GAME", "#614936", "#ffe1ac");
            }
          }
        }
      }
    }
    world.registerSystem(TableInput);
    // IWSDK's window resize handler sizes to the window. This shell owns a smaller container.
    const resize = () => {
      if (destroyed || world.renderer.xr.isPresenting) return;
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      world.renderer.setSize(width, height);
      world.camera.aspect = width / height;
      world.camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);
    resize();
    const immersiveStart = () => {
      actions.onImmersive(true);
      actions.onStatus("Immersive VR");
    };
    const immersiveEnd = () => {
      actions.onImmersive(false);
      actions.onStatus("Scene ready");
      requestAnimationFrame(resize);
    };
    world.renderer.xr.addEventListener("sessionstart", immersiveStart);
    world.renderer.xr.addEventListener("sessionend", immersiveEnd);
    const update = (next: SessionSnapshot) => {
      snapshot = next;
      const game = next.game;
      const revision = `${game?.gameId}:${game?.revision}:${next.status}:${next.aiThinking}`;
      if (revision === lastRevision) return;
      lastRevision = revision;
      tokens.forEach((token, index) => {
        token.visible = index < (game?.remaining ?? 15);
      });
      const title = !game
        ? "OPENING LOCAL SESSION"
        : game.winner
          ? game.winner === "human"
            ? "YOU WIN · LAST TOKEN"
            : "OPPONENT WINS"
          : game.turn === "ai"
            ? "OPPONENT IS THINKING"
            : `${game.remaining} TOKENS · YOUR TURN`;
      label.draw(title, "#2e4637", "#dcead8");
      for (const button of buttons) {
        const available =
          next.status === "ready" &&
          game?.turn === "human" &&
          !game.winner &&
          !next.aiThinking &&
          game.remaining >= button.take;
        button.surface.draw(
          `TAKE ${button.take}`,
          available ? "#badbc0" : "#354b3b",
          available ? "#17241b" : "#758b7a",
        );
      }
      if (!confirmRestart) restartSurface.draw("NEW GAME", "#243b2d", "#badbc0");
    };
    return {
      update,
      async supportsVR() {
        return Boolean(
          window.isSecureContext &&
            (await navigator.xr?.isSessionSupported("immersive-vr").catch(() => false)),
        );
      },
      async enterVR() {
        if (destroyed || requestingXR || world.session) return;
        if (!navigator.xr) throw new Error("WebXR is unavailable in this browser.");
        requestingXR = true;
        const cameraPosition = world.camera.position.clone(),
          cameraQuaternion = world.camera.quaternion.clone();
        const fov = world.camera.fov;
        let session: XRSession | undefined;
        try {
          // The SDK launch helper returns void and logs rejection; the explicit WebXR
          // request lets this UI report denial while retaining IWSDK's renderer/input.
          session = await navigator.xr.requestSession("immersive-vr", {
            optionalFeatures: ["local-floor", "hand-tracking"],
          });
          if (destroyed) {
            await session.end();
            return;
          }
          await session.requestReferenceSpace("local-floor");
          world.renderer.xr.setReferenceSpaceType("local-floor");
          session.addEventListener(
            "end",
            () => {
              world.session = undefined;
              requestAnimationFrame(() => {
                if (destroyed) return;
                world.camera.position.copy(cameraPosition);
                world.camera.quaternion.copy(cameraQuaternion);
                world.camera.fov = fov;
                resize();
              });
            },
            { once: true },
          );
          world.session = session;
          await world.renderer.xr.setSession(session);
        } catch (error) {
          world.session = undefined;
          await session?.end().catch(() => undefined);
          throw error;
        } finally {
          requestingXR = false;
        }
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        observer.disconnect();
        window.removeEventListener("resize", resize);
        world.renderer.xr.removeEventListener("sessionstart", immersiveStart);
        world.renderer.xr.removeEventListener("sessionend", immersiveEnd);
        void world.session?.end().catch(() => undefined);
        const geometries = new Set<{ dispose(): void }>();
        const materials = new Set<{ dispose(): void }>();
        world.scene.traverse((object) => {
          if (object instanceof Mesh) {
            geometries.add(object.geometry);
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              materials.add(material);
          }
        });
        world.destroy();
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials) material.dispose();
        for (const texture of textures) texture.dispose();
      },
    };
  } catch (error) {
    world.destroy();
    throw error;
  }
}
