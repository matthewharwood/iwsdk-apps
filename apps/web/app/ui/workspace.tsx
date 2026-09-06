import { atom, Provider, useAtomValue, useSetAtom } from "jotai";
import { ArrowDownToLine, ArrowUpFromLine, Box, Check, Glasses, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { appConfig } from "../app.config";
import { env } from "../env";
import type { TableScene } from "../game/scene/table";
import {
  createLocalSession,
  type LocalSession,
  type SessionSnapshot,
} from "../game/session/local-session";
import { prepareOffline } from "./offline";
import { TurnControls } from "./turn-controls";

const snapshotAtom = atom<SessionSnapshot | null>(null);
export function Workspace() {
  return (
    <Provider>
      <Workbench />
    </Provider>
  );
}
function Workbench() {
  const snapshot = useAtomValue(snapshotAtom);
  const publish = useSetAtom(snapshotAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<LocalSession | null>(null);
  const sceneRef = useRef<TableScene | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [sceneStatus, setSceneStatus] = useState("Loading scene");
  const [xrAvailable, setXrAvailable] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [offline, setOffline] = useState("Preparing offline assets");
  const [persistent, setPersistent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const session = createLocalSession({ namespace: appConfig.appId });
    sessionRef.current = session;
    const sync = () => {
      if (cancelled) return;
      const next = session.getSnapshot();
      publish(next);
      sceneRef.current?.update(next);
    };
    const unsubscribe = session.subscribe(sync);
    sync();
    void session.start().catch((reason) => {
      if (!cancelled) setError(String(reason));
    });
    const take = (amount: 1 | 2 | 3) => {
      void session.submit({ take: amount }).catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    };
    const restart = () => {
      void session.newGame().catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    };
    void import("../game/scene/table")
      .then(async ({ createTable }) => {
        if (cancelled || !containerRef.current) return;
        const table = await createTable(containerRef.current, {
          onTake: take,
          onRestart: restart,
          onStatus: (status) => {
            if (!cancelled) setSceneStatus(status);
          },
          onImmersive: (value) => {
            if (!cancelled) setImmersive(value);
          },
        });
        if (cancelled) {
          table.destroy();
          return;
        }
        sceneRef.current = table;
        table.update(session.getSnapshot());
        setSceneStatus("Scene ready");
        setXrAvailable(await table.supportsVR());
      })
      .catch((reason) => {
        if (!cancelled)
          setSceneStatus(
            `Scene unavailable: ${reason instanceof Error ? reason.message : String(reason)}`,
          );
      });
    void prepareOffline()
      .then((value) => {
        if (!cancelled) setOffline(value);
      })
      .catch(() => {
        if (!cancelled) setOffline("Offline assets unavailable");
      });
    void navigator.storage?.persisted?.().then((value) => {
      if (!cancelled) setPersistent(value);
    });
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat
      )
        return;
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        event.preventDefault();
        take(Number(event.key) as 1 | 2 | 3);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", keydown);
      unsubscribe();
      sceneRef.current?.destroy();
      sceneRef.current = null;
      sessionRef.current = null;
      void session.close();
    };
  }, [publish]);

  async function run(action: (session: LocalSession) => Promise<unknown>) {
    const session = sessionRef.current;
    if (!session) return;
    setError(null);
    setBusy(true);
    try {
      await action(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  function exportSave() {
    void run(async (session) => {
      const text = await session.exportSave();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "local-xr-save.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackup(true);
    });
  }
  function importSave(file: File | undefined) {
    if (!file) return;
    void run(async (session) => {
      if (file.size > 1_000_000) throw new Error("Save file exceeds 1 MB.");
      const content = await file.text();
      if (
        !window.confirm(
          "Replace the current local game with this save? Export a backup first if you want to keep it.",
        )
      )
        return;
      await session.importSave(content);
    });
  }
  const game = snapshot?.game;
  const ready = snapshot?.status === "ready";
  const status = game?.winner
    ? game.winner === "human"
      ? "You took the last token."
      : "The opponent took the last token."
    : game?.turn === "ai"
      ? "Opponent is thinking…"
      : "Your move.";
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">
            <Box size={21} />
          </span>
          <span>{env.VITE_APP_TITLE || appConfig.title}</span>
          <span className="version">01</span>
        </a>
        <span className="local-label">
          <i />
          LOCAL SESSION
        </span>
      </header>
      <main className="workspace">
        <section className="stage" aria-label="Interactive table">
          <div className="stage-heading">
            <span className="eyebrow">THE PLAYGROUND</span>
            <span className="scene-status" data-testid="scene-status">
              {sceneStatus}
            </span>
          </div>
          <div className="viewport" ref={containerRef} data-testid="viewport" />
          <div className="stage-caption">
            <span>One table. Two perspectives.</span>
            <button
              type="button"
              className="secondary"
              disabled={!xrAvailable}
              onClick={() => {
                void sceneRef.current?.enterVR().catch((reason) => setError(String(reason)));
              }}
            >
              <Glasses size={17} />
              {immersive ? "In VR" : xrAvailable ? "Enter VR" : "VR headset not detected"}
            </button>
          </div>
        </section>
        <aside className="sidebar">
          <div className="intro">
            <span className="eyebrow">A SMALL GAME. A COMPLETE STACK.</span>
            <h1>
              Take the last
              <br />
              token.
            </h1>
            <p>
              Take 1, 2, or 3 tokens each turn.
              <br />
              The last one wins. You go first.
            </p>
          </div>
          <div className="game-panel">
            <div className="score">
              <strong data-testid="remaining">{game?.remaining ?? "—"}</strong>
              <span>
                tokens
                <br />
                remaining
              </span>
            </div>
            <div className="turn-status" aria-live="polite">
              <span className={game?.turn === "ai" ? "dot amber" : "dot"} />
              <span>
                {ready
                  ? status
                  : snapshot?.status === "error"
                    ? "Storage needs attention"
                    : "Opening local session…"}
              </span>
            </div>
            <TurnControls
              remaining={game?.remaining ?? 15}
              turn={game?.turn ?? "human"}
              winner={game?.winner ?? null}
              pending={!ready || busy || Boolean(snapshot?.aiThinking)}
              onTake={(take) => void run((session) => session.submit({ take }))}
            />
            <p className="keyboard-hint">Click a choice, or use keys 1–3.</p>
          </div>
          {(error || snapshot?.error) && (
            <div role="alert" className="error-box">
              {error || snapshot?.error}
              <button
                type="button"
                className="text-button"
                onClick={() => window.location.reload()}
              >
                Retry connection
              </button>
            </div>
          )}
          <div className="history">
            <div className="section-label">
              <span>THIS GAME</span>
              <span data-testid="revision">REV {game?.revision ?? 0}</span>
            </div>
            <ol>
              {game?.history.slice(-4).map((move) => (
                <li key={move.revision}>
                  <span>
                    {move.actor === "human" ? "You" : "Opponent"} took {move.take}
                  </span>
                  <span>{move.remaining} left</span>
                </li>
              ))}
              {!game?.history.length && <li className="empty-history">The table is yours.</li>}
            </ol>
          </div>
          <div className="session-actions">
            <button
              type="button"
              className="secondary"
              disabled={!ready || busy}
              onClick={() => {
                if (
                  game?.history.length &&
                  !game.winner &&
                  !window.confirm("Start a new game? Export first to keep this one.")
                )
                  return;
                void run((session) => session.newGame());
              }}
            >
              <RotateCcw size={15} />
              New game
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Export save"
              title="Export save"
              disabled={!ready || busy}
              onClick={exportSave}
            >
              {backup ? <Check size={17} /> : <ArrowDownToLine size={17} />}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Import save"
              title="Import save"
              disabled={!ready || busy}
              onClick={() => fileRef.current?.click()}
            >
              <ArrowUpFromLine size={17} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                importSave(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
          <div className="storage-status">
            <span className="dot" />
            <div>
              <strong>{ready ? "Saved on this device" : "Local SQLite storage"}</strong>
              <p>
                {persistent ? "Persistent storage granted" : "Browser-managed storage"} · {offline}
              </p>
              {!persistent && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    void navigator.storage?.persist?.().then(setPersistent);
                  }}
                >
                  Request persistent storage
                </button>
              )}
            </div>
          </div>
        </aside>
      </main>
      <footer>
        <span>
          IWSDK + THREE.JS <b>/</b> SQLITE <b>/</b> REACT
        </span>
        <span>Heuristic opponent · No account required</span>
      </footer>
    </div>
  );
}
