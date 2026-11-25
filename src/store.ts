// One layout file per display, under the plugin's data directory.

import { promises as fs } from "node:fs";
import path from "node:path";

import { checkLayout, type Layout } from "./layout.js";

export class LayoutStore {
  private writes = 0;

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
  async write(displayId: string, layout: Layout): Promise<void> {
    const file = this.file(displayId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Unique per write: two pushes at once must not fill the same file.
    const tmp = `${file}.${process.pid}.${++this.writes}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(layout));
    await fs.rename(tmp, file);
  }
}
