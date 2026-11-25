import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Plugin, PluginRouter, ServerAPI } from "@signalk/server-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import createPlugin from "../src/index.js";

type Handler = (req: FakeReq, res: FakeRes) => unknown;

interface FakeReq {
  params: Record<string, string>;
  body?: unknown;
  on(event: string, fn: () => void): void;
}

class FakeRes {
  statusCode = 200;
  body: unknown;
  headers: Record<string, string> = {};
  written: string[] = [];
  writableEnded = false;
  on(): this {
    return this;
  }
  status(code: number): this {
    this.statusCode = code;
    return this;
  }
  set(k: string | Record<string, string>, v?: string): this {
    if (typeof k === "string") this.headers[k] = v ?? "";
    else Object.assign(this.headers, k);
    return this;
  }
  json(body: unknown): this {
    this.body = body;
    return this;
  }
  end(): this {
    this.writableEnded = true;
    return this;
  }
  flushHeaders(): void {}
  write(chunk: string): boolean {
    this.written.push(chunk);
    return true;
  }
}

/** Routes by "<access> <METHOD> <path>", access being readonly or admin. */
function fakeRouter(routes: Map<string, Handler>): PluginRouter {
  const make = (access: string) => ({
    get: (p: string, h: Handler) => routes.set(`${access} GET ${p}`, h),
    post: (p: string, h: Handler) => routes.set(`${access} POST ${p}`, h),
  });
  return {
    ...make("admin"),
    access: (level: string) => make(level),
  } as unknown as PluginRouter;
}

const req = (params: Record<string, string>, body?: unknown): FakeReq => ({
  params,
  body,
  on: () => undefined,
});

describe("plugin", () => {
  let dir = "";
  let plugin: Plugin;
  let status = "";
  let saved: unknown;
  const routes = new Map<string, Handler>();

  const call = async (key: string, r: FakeReq): Promise<FakeRes> => {
    const h = routes.get(key);
    if (!h) throw new Error(`no route ${key}`);
    const res = new FakeRes();
    await h(r, res);
    return res;
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "espos-hmi-"));
    routes.clear();
    saved = undefined;
    const app = {
      getDataDirPath: () => dir,
      getSelfPath: () => undefined,
      setPluginStatus: (s: string) => {
        status = s;
      },
      setPluginError: (s: string) => {
        throw new Error(s);
      },
      error: () => undefined,
      savePluginOptions: (o: unknown, cb: (err: null) => void) => {
        saved = o;
        cb(null);
      },
    } as unknown as ServerAPI;
    plugin = createPlugin(app);
    plugin.registerWithRouter?.(fakeRouter(routes));
    await plugin.start({}, () => undefined);
  });

  afterEach(async () => {
    await plugin.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("serves the default display with its size to readers", async () => {
    const res = await call("readonly GET /displays", req({}));
    expect(res.body).toEqual({
      displays: [
        {
          id: "helm",
          name: "Helm",
          resolution: "1920x1080",
          readOnly: false,
          w: 1920,
          h: 1080,
        },
      ],
    });
  });

  it("saves nothing for a fresh install", () => {
    expect(saved).toBeUndefined();
  });

  it("saves addresses made from names, so a rename keeps the layout", async () => {
    await plugin.stop();
    await plugin.start({ displays: [{ name: "Salon" }] }, () => undefined);
    expect(saved).toEqual({
      displays: [
        {
          id: "salon",
          name: "Salon",
          resolution: "1920x1080",
          readOnly: false,
        },
      ],
    });
  });

  it("lets only the admin push a layout", () => {
    expect(routes.has("admin POST /displays/:id/layout")).toBe(true);
    expect(routes.has("readonly POST /displays/:id/layout")).toBe(false);
  });

  it("shows the starter until a layout is pushed, then the pushed one", async () => {
    let res = await call(
      "readonly GET /displays/:id/layout",
      req({ id: "helm" }),
    );
    expect(res.headers["X-Layout-Source"]).toBe("starter");

    const events = await call(
      "readonly GET /displays/:id/events",
      req({ id: "helm" }),
    );
    const layout = {
      schema: 1,
      name: "Mine",
      screens: [{ id: "a", widgets: [] }],
    };
    res = await call(
      "admin POST /displays/:id/layout",
      req({ id: "helm" }, layout),
    );
    expect(res.body).toEqual({
      ok: true,
      name: "Mine",
      screens: 1,
      widgets: 0,
    });
    expect(events.written.join("")).toContain("event: layout");

    res = await call("readonly GET /displays/:id/layout", req({ id: "helm" }));
    expect(res.headers["X-Layout-Source"]).toBe("stored");
    expect(res.body).toEqual(layout);

    res = await call("readonly GET /displays/:id/hello", req({ id: "helm" }));
    expect(res.body).toMatchObject({ name: "Mine", layout_source: "stored" });
    await new Promise((r) => setTimeout(r, 20));
    expect(status).toContain("own layout");
  });

  it("refuses a bad layout and an unknown display", async () => {
    let res = await call(
      "admin POST /displays/:id/layout",
      req({ id: "helm" }, { schema: 2 }),
    );
    expect(res.statusCode).toBe(400);
    res = await call(
      "admin POST /displays/:id/layout",
      req({ id: "nope" }, {}),
    );
    expect(res.statusCode).toBe(404);
    res = await call("readonly GET /displays/:id/layout", req({ id: "nope" }));
    expect(res.statusCode).toBe(404);
  });
});
