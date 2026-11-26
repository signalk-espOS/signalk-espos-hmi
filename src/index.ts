import type { Plugin, PluginRouter, ServerAPI } from "@signalk/server-api";
import type { Request, Response } from "express";
import { readFileSync } from "node:fs";

import {
  addressesMissing,
  applyDefaults,
  resolutionSize,
  schema,
  uiSchema,
  type DisplayProfile,
  type Settings,
} from "./config.js";
import { buildHello, type LayoutSource } from "./hello.js";
import { checkLayout, type Layout } from "./layout.js";
import { findSwitches, findTanks, starterLayout } from "./starter.js";
import { LayoutStore } from "./store.js";

const PLUGIN_ID = "signalk-espos-hmi";

function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

interface Resolved {
  layout: Layout;
  source: LayoutSource;
}

export default function (app: ServerAPI): Plugin {
  const version = packageVersion();
  let settings: Settings = applyDefaults({});
  let store: LayoutStore | null = null;
  // Open webapp pages per display, told when a new layout arrives.
  const listeners = new Map<string, Set<Response>>();

  const display = (id: unknown): DisplayProfile | undefined =>
    settings.displays.find((d) => d.id === id);

  const layoutStore = (): LayoutStore => {
    store ??= new LayoutStore(app.getDataDirPath());
    return store;
  };

  const resolve = async (d: DisplayProfile): Promise<Resolved> => {
    const stored = await layoutStore().read(d.id);
    if (stored) return { layout: stored, source: "stored" };
    const { w, h } = resolutionSize(d.resolution);
    return {
      layout: starterLayout(
        d.name,
        w,
        h,
        findSwitches(app.getSelfPath("electrical.switches")),
        findTanks(app.getSelfPath("tanks")),
      ),
      source: "starter",
    };
  };

  const pings = new Map<Response, NodeJS.Timeout>();

  const send = (res: Response, text: string): void => {
    if (res.writableEnded) return;
    res.write(text);
    // Signal K compresses responses; without a flush an event can wait in
    // the compressor's buffer indefinitely.
    (res as Response & { flush?: () => void }).flush?.();
  };

  const notify = (displayId: string, name: string): void => {
    for (const res of listeners.get(displayId) ?? []) {
      send(res, `event: layout\ndata: ${JSON.stringify({ name })}\n\n`);
    }
  };

  const showStatus = async (): Promise<void> => {
    const parts: string[] = [];
    for (const d of settings.displays) {
      let source = "starter layout";
      try {
        if (await layoutStore().read(d.id)) source = "own layout";
      } catch {
        source = "layout unreadable";
      }
      const { w, h } = resolutionSize(d.resolution);
      parts.push(`${d.name} (${w}×${h}, ${source})`);
    }
    app.setPluginStatus(parts.join("; "));
  };

  return {
    id: PLUGIN_ID,
    name: "espOS HMI",
    description:
      "Touchscreen helm display for layouts made in the espOS HMI designer",
    schema: () => schema,
    uiSchema: () => uiSchema,

    start: (raw: unknown) => {
      settings = applyDefaults(raw);
      // Layouts are stored by address. One made from the name would move
      // with a rename and orphan the layout, so the first one made is kept.
      if (addressesMissing(raw, settings)) {
        app.savePluginOptions({ ...(raw as object), ...settings }, (err) => {
          if (err) app.error(`saving display addresses: ${err.message}`);
        });
      }
      showStatus().catch((err: unknown) => {
        app.setPluginError(`status: ${(err as Error).message}`);
      });
    },

    stop: () => {
      for (const ping of pings.values()) clearInterval(ping);
      pings.clear();
      for (const set of listeners.values()) {
        for (const res of set) res.end();
      }
      listeners.clear();
    },

    registerWithRouter(router: PluginRouter) {
      // Reading is for everyone who may read the server; pushing a layout
      // is the admin's, as on the designer. Servers before 2.34 have no
      // access() and gate no plugin route.
      const readable =
        typeof router.access === "function"
          ? router.access("readonly")
          : router;

      readable.get("/displays", (_req: Request, res: Response) => {
        res.json({
          displays: settings.displays.map((d) => ({
            ...d,
            ...resolutionSize(d.resolution),
          })),
        });
      });

      readable.get(
        "/displays/:id/hello",
        async (req: Request, res: Response) => {
          const d = display(req.params.id);
          if (!d) {
            res.status(404).json({ error: "no such display" });
            return;
          }
          try {
            const { layout, source } = await resolve(d);
            res.json(buildHello(d, version, layout.name, source));
          } catch (err) {
            app.error(`hello ${d.id}: ${(err as Error).message}`);
            res.status(500).json({ error: "could not read the layout" });
          }
        },
      );

      readable.get(
        "/displays/:id/layout",
        async (req: Request, res: Response) => {
          const d = display(req.params.id);
          if (!d) {
            res.status(404).json({ error: "no such display" });
            return;
          }
          try {
            const { layout, source } = await resolve(d);
            res.set("X-Layout-Source", source).json(layout);
          } catch (err) {
            app.error(`layout ${d.id}: ${(err as Error).message}`);
            res.status(500).json({ error: "could not read the layout" });
          }
        },
      );

      // Same answer shape as a panel's POST /layout, so the designer reads
      // both alike.
      router.post(
        "/displays/:id/layout",
        async (req: Request, res: Response) => {
          const d = display(req.params.id);
          if (!d) {
            res.status(404).json({ ok: false, err: "no such display" });
            return;
          }
          const check = checkLayout(req.body);
          if (!check.ok) {
            res.status(400).json({ ok: false, err: check.err });
            return;
          }
          try {
            await layoutStore().write(d.id, check.layout);
          } catch (err) {
            app.error(`store ${d.id}: ${(err as Error).message}`);
            res
              .status(500)
              .json({ ok: false, err: "could not store the layout" });
            return;
          }
          notify(d.id, check.layout.name);
          void showStatus();
          res.json({
            ok: true,
            name: check.layout.name,
            screens: check.layout.screens.length,
            widgets: check.widgets,
          });
        },
      );

      readable.get("/displays/:id/events", (req: Request, res: Response) => {
        const d = display(req.params.id);
        if (!d) {
          res.status(404).end();
          return;
        }
        res.set({
          "Content-Type": "text/event-stream",
          // no-transform keeps the compression middleware off the stream.
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });
        res.flushHeaders();
        // A comment line every 25 s keeps proxies from closing a quiet stream.
        pings.set(
          res,
          setInterval(() => send(res, ": ping\n\n"), 25000),
        );
        const set = listeners.get(d.id) ?? new Set<Response>();
        set.add(res);
        listeners.set(d.id, set);
        res.on("close", () => {
          clearInterval(pings.get(res));
          pings.delete(res);
          set.delete(res);
        });
      });
    },
  };
}
