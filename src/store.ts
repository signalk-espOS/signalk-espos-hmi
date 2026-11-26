// One layout file per display, under the plugin's data directory.

import { promises as fs } from "node:fs";
import path from "node:path";

import { checkLayout, type Layout } from "./layout.js";

export class LayoutStore {
  private writes = 0;
  // One write per display at a time: Windows refuses to rename onto a
  // file another rename is replacing (EPERM).
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly dir: string) {}

  private file(displayId: string): string {
    // Ids are checked against ^[a-z0-9][a-z0-9-]*$ in config.ts, so they
    // cannot leave the directory.
    return path.join(this.dir, "layouts", `${displayId}.json`);
  }

  /** The stored layout, or null when there is none or it no longer parses. */
  async read(displayId: string): Promise<Layout | null> {
    let text: string;
    try {
      text = await fs.readFile(this.file(displayId), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    const check = checkLayout(parsed);
    return check.ok ? check.layout : null;
  }

  /** Writes through a temporary file, so a crash never leaves half a layout. */
  write(displayId: string, layout: Layout): Promise<void> {
    const prev = this.queues.get(displayId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(() => this.writeNow(displayId, layout));
    this.queues.set(displayId, next);
    const settle = (): void => {
      if (this.queues.get(displayId) === next) this.queues.delete(displayId);
    };
    next.then(settle, settle);
    return next;
  }

  private async writeNow(displayId: string, layout: Layout): Promise<void> {
    const file = this.file(displayId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${++this.writes}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(layout));
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }
}
