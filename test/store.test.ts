import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Layout } from "../src/layout.js";
import { LayoutStore } from "../src/store.js";

const layout: Layout = {
  schema: 1,
  name: "Mine",
  screens: [{ id: "main", widgets: [] }],
};

describe("LayoutStore", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "espos-hmi-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("has nothing for a display never pushed to", async () => {
    expect(await new LayoutStore(dir).read("helm")).toBeNull();
  });

  it("reads back what it wrote, per display", async () => {
    const store = new LayoutStore(dir);
    await store.write("helm", layout);
    expect(await store.read("helm")).toEqual(layout);
    expect(await store.read("salon")).toBeNull();
  });

  it("treats a damaged file as no layout", async () => {
    await mkdir(path.join(dir, "layouts"));
    await writeFile(path.join(dir, "layouts", "helm.json"), "{nope");
    expect(await new LayoutStore(dir).read("helm")).toBeNull();
  });
});
