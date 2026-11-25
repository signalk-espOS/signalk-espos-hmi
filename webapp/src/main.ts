import "./style.css";

import { boundPaths, type Layout } from "../../src/layout.js";
import { fitBox, toDisplay, type Box } from "./fit.js";
import { SkClient } from "./signalk.js";
import { Renderer } from "./wasm.js";

const PLUGIN = "/plugins/signalk-espos-hmi";

interface DisplayInfo {
  id: string;
  name: string;
  w: number;
  h: number;
  readOnly: boolean;
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const notice = document.getElementById("notice") as HTMLDivElement;
const picker = document.getElementById("picker") as HTMLDivElement;

function say(text: string | null): void {
  notice.textContent = text ?? "";
  notice.hidden = text === null;
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** The display named in the address, or the only one, or a choice. */
async function chooseDisplay(): Promise<DisplayInfo | null> {
  const { displays } = await json<{ displays: DisplayInfo[] }>(
    `${PLUGIN}/displays`,
  );
  const wanted = new URLSearchParams(location.search).get("display");
  const match = displays.find((d) => d.id === wanted);
  if (match) return match;
  if (displays.length === 1 && displays[0]) return displays[0];
  picker.replaceChildren(
    ...displays.map((d) => {
      const a = document.createElement("a");
      a.href = `?display=${encodeURIComponent(d.id)}`;
      a.textContent = `${d.name} · ${d.w} × ${d.h}`;
      return a;
    }),
  );
  picker.hidden = false;
  return null;
}

async function run(): Promise<void> {
  const display = await chooseDisplay();
  if (!display) return;
  document.title = `${display.name} · espOS HMI`;

  let box: Box = fitBox(display.w, display.h, innerWidth, innerHeight);
  const place = (): void => {
    box = fitBox(display.w, display.h, innerWidth, innerHeight);
    // The canvas is sized by CSS, never by a transform: SDL's WebGL output
    // reads the element's own box.
    Object.assign(canvas.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
  };
  place();
  addEventListener("resize", place);

  const sk = new SkClient({
    onValue: (p, v) => renderer.setValue(p, v),
    onMeta: (p, m) => renderer.setMeta(p, m),
    onNotifications: (rows) => renderer.setNotifications(rows),
    onMode: (mode) => renderer.setTheme(mode === "night" ? "night" : "auto"),
    onConnection: (up) => say(up ? null : "Connecting to Signal K…"),
  });

  const renderer = await Renderer.load(
    canvas,
    display.w,
    display.h,
    (path, value) => {
      if (display.readOnly) return;
      sk.put(path, value).catch((err: unknown) =>
        console.warn((err as Error).message),
      );
    },
    (path) => {
      if (display.readOnly) return;
      if (!sk.ack(path)) say("Not connected: the alarm was not acknowledged");
    },
  );

  // A second screen at the helm can open on its own page: ?screen=<id>.
  // A new layout starts on its first screen, so the choice is made again.
  const screen = new URLSearchParams(location.search).get("screen");

  // Two pushes close together can answer out of order; only the newest
  // request may replace the layout.
  let generation = 0;
  const show = async (): Promise<void> => {
    const mine = ++generation;
    const layout = await json<Layout>(
      `${PLUGIN}/displays/${encodeURIComponent(display.id)}/layout`,
    );
    if (mine !== generation) return;
    const err = renderer.apply(layout);
    if (err) {
      say(`Layout not shown: ${err}`);
      return;
    }
    sk.follow(boundPaths(layout));
    if (screen && !renderer.selectScreen(screen)) {
      say(`Screen "${screen}" not shown`);
    }
  };
  await show();

  // A layout pushed from the designer replaces this one at once.
  const events = new EventSource(
    `${PLUGIN}/displays/${encodeURIComponent(display.id)}/events`,
  );
  const reload = (): void => {
    show().catch((err: unknown) => say((err as Error).message));
  };
  events.addEventListener("layout", reload);
  // A push made before the stream opened, or while it was down, sent no
  // event here.
  events.addEventListener("open", reload);

  if (renderer.interactive && !display.readOnly) {
    const send = (ev: PointerEvent, pressed: boolean): void => {
      const p = toDisplay(box, display.w, display.h, ev.clientX, ev.clientY);
      if (p) renderer.pointer(p.x, p.y, pressed);
      else if (!pressed) renderer.pointer(0, 0, false);
    };
    canvas.addEventListener("pointerdown", (ev) => {
      canvas.setPointerCapture(ev.pointerId);
      send(ev, true);
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (ev.buttons !== 0) send(ev, true);
    });
    canvas.addEventListener("pointerup", (ev) => send(ev, false));
    canvas.addEventListener("pointercancel", (ev) => send(ev, false));
  }

  // A helm screen should not go dark while the page is open.
  const keepAwake = async (): Promise<void> => {
    if (document.visibilityState !== "visible") return;
    try {
      await navigator.wakeLock?.request("screen");
    } catch {
      // Refused (battery saver, no permission): the screen may sleep.
    }
  };
  document.addEventListener("visibilitychange", () => void keepAwake());
  void keepAwake();
}

run().catch((err: unknown) => say((err as Error).message));
