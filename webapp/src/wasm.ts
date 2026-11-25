// The LVGL renderer: the espOS panel firmware's widget code compiled to
// WebAssembly (espos-p4-cockpit-wasm). Only what this page calls is typed.

export type SkScalar = number | boolean;

/** Called by the renderer when a widget wants to write a value. */
export type PutHandler = (path: string, value: unknown) => void;
/** Called by the renderer when the alert overlay's ACK is tapped. */
export type AckHandler = (pathAfterPrefix: string) => void;

interface JlpModule {
  _jlp_init(w: number, h: number): number;
  _jlp_resize?(w: number, h: number): number;
  _jlp_apply_layout(json: number): number;
  _jlp_set_value_float(path: number, v: number): void;
  _jlp_set_value_int(path: number, v: number): void;
  _jlp_set_value_bool(path: number, v: number): void;
  _jlp_set_path_meta(path: number, meta: number): void;
  _jlp_set_notifications(json: number): void;
  _jlp_set_theme?(mode: number): number;
  // From the runtime mode on: touch in, writes out. A bundle without it
  // still renders, as a display that only shows.
  _jlp_pointer?(x: number, y: number, pressed: number): void;
  _malloc(n: number): number;
  _free(p: number): void;
  stringToUTF8(s: string, ptr: number, max: number): void;
  lengthBytesUTF8(s: string): number;
  UTF8ToString(ptr: number): string;
}

interface ModuleOptions {
  canvas: HTMLCanvasElement;
  keyEventTarget: HTMLElement;
  mouseEventTarget: HTMLElement;
  print: (s: string) => void;
  printErr: (s: string) => void;
  jlpPut: (path: string, json: string) => void;
  jlpAck: (pathAfterPrefix: string) => void;
}

type ModuleFactory = (opts: ModuleOptions) => Promise<JlpModule>;

export class Renderer {
  private constructor(private readonly mod: JlpModule) {}

  /** True when the bundle takes touch and sends writes. */
  get interactive(): boolean {
    return typeof this.mod._jlp_pointer === "function";
  }

  static async load(
    canvas: HTMLCanvasElement,
    w: number,
    h: number,
    onPut: PutHandler,
    onAck: AckHandler,
  ): Promise<Renderer> {
    const url = new URL("./wasm/jlp_wasm.js", document.baseURI).href;
    const imported = (await import(/* @vite-ignore */ url)) as {
      default: ModuleFactory;
    };
    const mod = await imported.default({
      canvas,
      // Keeps SDL's listeners on the canvas instead of the whole page.
      keyEventTarget: canvas,
      mouseEventTarget: canvas,
      print: (s) => console.info("[jlp]", s),
      printErr: (s) => console.warn("[jlp]", s),
      jlpPut: (path, json) => {
        try {
          onPut(path, JSON.parse(json) as unknown);
        } catch {
          console.warn("[jlp] unreadable write for", path);
        }
      },
      jlpAck: (p) => onAck(p),
    });
    if (mod._jlp_init(w, h) !== 0) throw new Error("renderer did not start");
    return new Renderer(mod);
  }

  private withString<T>(s: string, fn: (ptr: number) => T): T {
    const len = this.mod.lengthBytesUTF8(s) + 1;
    const ptr = this.mod._malloc(len);
    try {
      this.mod.stringToUTF8(s, ptr, len);
      return fn(ptr);
    } finally {
      this.mod._free(ptr);
    }
  }

  resize(w: number, h: number): void {
    this.mod._jlp_resize?.(w, h);
  }

  /** Builds the layout; returns why not, or null when it is on screen. */
  apply(layout: unknown): string | null {
    const err = this.withString(JSON.stringify(layout), (p) =>
      this.mod.UTF8ToString(this.mod._jlp_apply_layout(p)),
    );
    return err === "" ? null : err;
  }

  setValue(path: string, v: SkScalar): void {
    this.withString(path, (p) => {
      if (typeof v === "boolean") {
        this.mod._jlp_set_value_bool(p, v ? 1 : 0);
        return;
      }
      // The setters ignore a subject of the other kind: toggles hold
      // ints, gauges floats, and the page cannot tell which this is.
      this.mod._jlp_set_value_float(p, v);
      this.mod._jlp_set_value_int(p, Math.round(v));
    });
  }

  setMeta(path: string, meta: unknown): void {
    this.withString(path, (p) =>
      this.withString(JSON.stringify(meta), (m) =>
        this.mod._jlp_set_path_meta(p, m),
      ),
    );
  }

  setNotifications(rows: NotificationRow[]): void {
    this.withString(JSON.stringify(rows), (p) =>
      this.mod._jlp_set_notifications(p),
    );
  }

  setTheme(mode: "auto" | "day" | "dark" | "night"): void {
    const fn = this.mod._jlp_set_theme;
    if (fn) this.withString(mode, (p) => fn(p));
  }

  pointer(x: number, y: number, pressed: boolean): void {
    this.mod._jlp_pointer?.(Math.round(x), Math.round(y), pressed ? 1 : 0);
  }
}

/** One notification as the renderer's registry takes it. */
export interface NotificationRow {
  /** The path after `notifications.`. */
  path: string;
  state: string;
  message: string;
}
