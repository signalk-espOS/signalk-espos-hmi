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

function chips(
  label: string,
  choices: Choice[],
  selected: string,
  pick: (value: string) => void,
): HTMLElement {
  return el(
    "fieldset",
    { className: "chips" },
    el("legend", {}, label),
    ...choices.map((c) => {
      const b = el("button", { type: "button", textContent: c.label });
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

  const update = (next: EditDisplay[]): void => {
    displays = next;
    removing = -1;
    status.textContent = "";
    render();
  };

  const card = (d: EditDisplay, i: number): HTMLElement => {
    const name = el("input", { type: "text", value: d.name });
    name.setAttribute("aria-label", "Name");
    name.addEventListener("input", () => {
      displays = displays.map((x, j) =>
        j === i ? { ...x, name: name.value } : x,
      );
    });
    // Choices list display names; show the new one once the field is left.
    name.addEventListener("change", render);

    const followers = followersOf(displays, i);
    const remove = el("button", {
      type: "button",
      className: "remove",
      textContent: removing === i ? "Tap again to remove" : "Remove",
    });
    remove.addEventListener("click", () => {
      if (removing === i) {
        update(removeDisplay(displays, i));
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
        resolutions.map((res) => ({ value: res.id, label: res.title })),
        d.resolution,
        (v) =>
          update(
            displays.map((x, j) => (j === i ? { ...x, resolution: v } : x)),
          ),
      ),
      chips("Layout", layoutChoices(displays, i), d.layoutFrom, (v) =>
        update(setLayoutFrom(displays, i, v)),
      ),
      followers.length > 0
        ? el(
            "p",
            { className: "muted" },
            `Also shown on ${followers.join(", ")}`,
          )
        : "",
      chips(
        "Switching",
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
    status.textContent = "Saving…";
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
    update(fromServer(await res.json()));
    status.textContent = "Saved";
  };

  const render = (): void => {
    const add = el("button", { type: "button", textContent: "Add display" });
    add.addEventListener("click", () =>
      update(addDisplay(displays, resolutions[0]?.id ?? "1920x1080")),
    );
    const saveButton = el("button", {
      type: "button",
      className: "primary",
      textContent: "Save",
    });
    saveButton.addEventListener("click", () => {
      save().catch((err: unknown) => {
        status.textContent = `Not saved: ${(err as Error).message}`;
      });
    });
    root.replaceChildren(
      el("h1", {}, "Displays"),
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
      status,
    );
  };
  render();
}
