// One WebSocket to the Signal K server for everything the display shows,
// and REST for writes. The page runs on the server's own origin, so the
// signed-in user's session applies to both.

import type { NotificationRow, SkScalar } from "./wasm.js";

export interface SkHandlers {
  onValue(path: string, value: SkScalar): void;
  onMeta(path: string, meta: unknown): void;
  onNotifications(rows: NotificationRow[]): void;
  onMode(mode: string | null): void;
  onConnection(connected: boolean): void;
}

interface DeltaValue {
  path?: unknown;
  value?: unknown;
}

interface Delta {
  context?: unknown;
  updates?: { values?: DeltaValue[]; meta?: DeltaValue[] }[];
}

const NOTIFICATIONS = "notifications.";

export class SkClient {
  private ws: WebSocket | null = null;
  private paths: string[] = [];
  private retry = 1000;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly notifications = new Map<string, NotificationRow>();

  constructor(private readonly h: SkHandlers) {}

  /** Follows these paths from now on, replacing the previous set. */
  follow(paths: string[]): void {
    this.paths = paths;
    this.resetNotifications();
    // An open socket swaps its subscriptions; the server sends the last
    // known values again. One still connecting subscribes when it opens.
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ context: "*", unsubscribe: [{ path: "*" }] }),
      );
      this.ws.send(this.subscribeMessage());
      return;
    }
    this.open();
  }

  stop(): void {
    this.closed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ws?.close();
  }

  private open(): void {
    // One socket per page: a retry and a follow() must not both open one.
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.closed || this.ws) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${location.host}/signalk/v1/stream?subscribe=none&sendMeta=all`,
    );
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      // Alarms cleared while the socket was down are never sent again.
      this.resetNotifications();
      this.h.onConnection(true);
      ws.send(this.subscribeMessage());
    };
    ws.onmessage = (ev: MessageEvent<string>) => {
      let msg: Delta;
      try {
        msg = JSON.parse(ev.data) as Delta;
      } catch {
        return;
      }
      if (Array.isArray(msg.updates)) this.delta(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.h.onConnection(false);
      if (this.closed) return;
      this.retryTimer = setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 15000);
    };
  }

  private subscribeMessage(): string {
    const subscribe = [
      ...this.paths,
      "notifications.*",
      "environment.mode",
    ].map((path) => ({ path, policy: "instant" }));
    return JSON.stringify({ context: "vessels.self", subscribe });
  }

  private resetNotifications(): void {
    this.notifications.clear();
    this.h.onNotifications([]);
  }

  private delta(msg: Delta): void {
    let notificationsChanged = false;
    for (const u of msg.updates ?? []) {
      for (const m of u.meta ?? []) {
        if (typeof m.path === "string") this.h.onMeta(m.path, m.value);
      }
      for (const v of u.values ?? []) {
        if (typeof v.path !== "string") continue;
        if (v.path.startsWith(NOTIFICATIONS)) {
          this.notification(v.path.slice(NOTIFICATIONS.length), v.value);
          notificationsChanged = true;
        } else if (v.path === "environment.mode") {
          this.h.onMode(typeof v.value === "string" ? v.value : null);
        } else if (
          typeof v.value === "number" ||
          typeof v.value === "boolean"
        ) {
          this.h.onValue(v.path, v.value);
        }
      }
    }
    if (notificationsChanged) {
      this.h.onNotifications([...this.notifications.values()]);
    }
  }

  private notification(path: string, value: unknown): void {
    const n = value as { state?: unknown; message?: unknown } | null;
    const state = typeof n?.state === "string" ? n.state : "normal";
    if (state === "normal" || state === "nominal") {
      this.notifications.delete(path);
      return;
    }
    this.notifications.set(path, {
      path,
      state,
      message: typeof n?.message === "string" ? n.message : "",
    });
  }

  /** PUT through the server, which hands it to the device that owns the path. */
  async put(path: string, value: unknown): Promise<void> {
    const r = await fetch(
      `/signalk/v1/api/vessels/self/${path.split(".").map(encodeURIComponent).join("/")}`,
      {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      },
    );
    if (!r.ok && r.status !== 202) {
      throw new Error(`PUT ${path}: HTTP ${r.status}`);
    }
  }

  /**
   * Clears a notification the way the panel does: a delta with state
   * normal, which the server's notification manager takes, where a PUT
   * to the path is not wired up.
   */
  ack(pathAfterPrefix: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(
      JSON.stringify({
        context: "vessels.self",
        updates: [
          {
            values: [
              {
                path: NOTIFICATIONS + pathAfterPrefix,
                value: { state: "normal", message: "", method: [] },
              },
            ],
          },
        ],
      }),
    );
    return true;
  }
}
