// The settings page (?settings): the displays this server shows, for the
// admin. Touch-first: every choice is a tap target, nothing to type but
// a display's name.

import {
  addDisplay,
  followersOf,
  fromServer,
  layoutChoices,
  removeDisplay,
  setLayoutFrom,
  toServer,
  type Choice,
  type EditDisplay,
} from "./settings-model.js";

const PLUGIN = "/plugins/signalk-espos-hmi";

interface Resolution {
  id: string;
  title: string;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// A render replaces every control; the key finds the one to focus again.
function keyed<T extends HTMLElement>(node: T, key: string): T {
  node.dataset.key = key;
  return node;
}

function chips(
  label: string,
  key: string,
  choices: Choice[],
  selected: string,
  pick: (value: string) => void,
): HTMLElement {
  return el(
    "fieldset",
    { className: "chips" },
    el("legend", {}, label),
    ...choices.map((c) => {
      const b = keyed(
        el("button", { type: "button", textContent: c.label }),
        `${key}:${c.value}`,
      );
      b.setAttribute("aria-pressed", String(c.value === selected));
      b.addEventListener("click", () => pick(c.value));
      return b;
    }),
  );
}

export async function runSettings(root: HTMLElement): Promise<void> {
  document.title = "Settings · espOS HMI";
  root.hidden = false;
  const status = el("p", { className: "status" });
  status.setAttribute("role", "status");

  const r = await fetch(`${PLUGIN}/settings`, { credentials: "same-origin" });
  if (r.status === 401 || r.status === 403) {
    root.replaceChildren(
      el("h1", {}, "Settings"),
      el("p", {}, "Setting up displays needs an admin login."),
      el("a", { className: "action", href: "/admin/#/login" }, "Sign in"),
      el("a", { className: "action", href: "./" }, "Back to the display"),
    );
    return;
  }
  if (!r.ok) throw new Error(`settings: HTTP ${r.status}`);
  const loaded = (await r.json()) as { resolutions?: Resolution[] };
  const resolutions = loaded.resolutions ?? [];
  let displays = fromServer(loaded);
  // The remove button asks for a second tap instead of a dialog.
  let removing = -1;
  // Nothing can be edited while a save is on its way: its answer replaces
  // the list, and an edit made meanwhile would be dropped.
  let saving = false;

  const update = (next: EditDisplay[], focus?: string): void => {
    displays = next;
    removing = -1;
    status.textContent = "";
    render(focus);
  };

  // A name shows up in other cards' layout choices and follower lines.
  // These change in place: a render here would replace the button being
  // pressed when the field loses focus, and the press would be lost.
  const relabel = (): void => {
    displays.forEach((_, i) => {
      for (const c of layoutChoices(displays, i)) {
        const b = root.querySelector(
          `[data-key="${CSS.escape(`layout-${i}:${c.value}`)}"]`,
        );
        if (b) b.textContent = c.label;
      }
      const line = root.querySelector(`[data-key="followers-${i}"]`);
      if (line) line.textContent = followerText(followersOf(displays, i));
    });
  };

  const followerText = (names: string[]): string =>
    `Also shown on ${names.join(", ")}`;

  const card = (d: EditDisplay, i: number): HTMLElement => {
    const name = keyed(
      el("input", { type: "text", value: d.name }),
      `name-${i}`,
    );
    name.setAttribute("aria-label", "Name");
    name.addEventListener("input", () => {
      displays = displays.map((x, j) =>
        j === i ? { ...x, name: name.value } : x,
      );
      relabel();
    });

    const followers = followersOf(displays, i);
    const remove = keyed(
      el("button", {
        type: "button",
        className: "remove",
        textContent: removing === i ? "Tap again to remove" : "Remove",
      }),
      `remove-${i}`,
    );
    remove.addEventListener("click", () => {
      if (removing === i) {
        const next = removeDisplay(displays, i);
        update(next, `name-${Math.min(i, next.length - 1)}`);
      } else {
        removing = i;
        render();
      }
    });

    return el(
      "section",
      { className: "display" },
      name,
      el(
        "p",
        { className: "muted" },
        d.id === ""
          ? "Address made from the name when saved"
          : `Address ?display=${d.id}`,
      ),
      chips(
        "Screen size",
        `size-${i}`,
        resolutions.map((res) => ({ value: res.id, label: res.title })),
        d.resolution,
        (v) =>
          update(
            displays.map((x, j) => (j === i ? { ...x, resolution: v } : x)),
          ),
      ),
      chips(
        "Layout",
        `layout-${i}`,
        layoutChoices(displays, i),
        d.layoutFrom,
        (v) => update(setLayoutFrom(displays, i, v)),
      ),
      followers.length > 0
        ? keyed(
            el("p", { className: "muted" }, followerText(followers)),
            `followers-${i}`,
          )
        : "",
      chips(
        "Switching",
        `switching-${i}`,
        [
          { value: "on", label: "Switches" },
          { value: "off", label: "Values only" },
        ],
        d.readOnly ? "off" : "on",
        (v) =>
          update(
            displays.map((x, j) =>
              j === i ? { ...x, readOnly: v === "off" } : x,
            ),
          ),
      ),
      displays.length > 1 ? remove : "",
    );
  };

  const save = async (): Promise<void> => {
    saving = true;
    removing = -1;
    render();
    status.textContent = "Saving…";
    try {
      const res = await fetch(`${PLUGIN}/settings`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toServer(displays)),
      });
      if (!res.ok) {
        status.textContent = `Not saved: HTTP ${res.status}`;
        return;
      }
      const saved = fromServer(await res.json());
      saving = false;
      update(saved, "save");
      status.textContent = "Saved";
    } catch (err) {
      status.textContent = `Not saved: ${(err as Error).message}`;
    } finally {
      if (saving) {
        saving = false;
        render("save");
      }
    }
  };

  const render = (
    focus = (document.activeElement as HTMLElement | null)?.dataset.key,
  ): void => {
    const add = keyed(
      el("button", { type: "button", textContent: "Add display" }),
      "add",
    );
    add.addEventListener("click", () =>
      update(addDisplay(displays, resolutions[0]?.id ?? "1920x1080")),
    );
    const saveButton = keyed(
      el("button", {
        type: "button",
        className: "primary",
        textContent: "Save",
      }),
      "save",
    );
    saveButton.addEventListener("click", () => void save());
    root.replaceChildren(
      el("h1", {}, "Displays"),
      el(
        "fieldset",
        { className: "form", disabled: saving },
        ...displays.map(card),
        el(
          "p",
          { className: "muted" },
          "A display added here can be picked as a layout once it is saved.",
        ),
        el(
          "div",
          { className: "bar" },
          add,
          saveButton,
          el("a", { className: "action", href: "./" }, "Done"),
        ),
      ),
      status,
    );
    if (focus) {
      root
        .querySelector<HTMLElement>(`[data-key="${CSS.escape(focus)}"]`)
        ?.focus();
    }
  };
  render();
}
