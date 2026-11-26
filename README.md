# signalk-espos-hmi

A touchscreen helm display for Signal K. It shows layouts made in the
[espOS HMI designer](https://github.com/signalk-espOS/signalk-espos-hmi-designer)
in the browser, drawn by the same LVGL code the espOS panels run, compiled
to WebAssembly. One design looks the same on a Full HD helm monitor and on
an ESP32-P4 panel.

It is meant for digital switching and the values around it: switches,
tanks, batteries, alarms.

## Use

1. Install **espOS HMI** from the Signal K App Store. It starts with one
   display, **Helm**, at 1920 × 1080.
2. Open **Webapps → espOS HMI**. Until a layout is pushed, the display
   shows a starter layout made from the switches and tanks the server
   knows.
3. In the HMI designer, pick the browser display as the target and push.
   Every open page of that display switches to the new layout at once.

More screens: add a display per screen in the plugin settings, each with
its size. Open a display directly with `?display=<address>`, for example
`/signalk-espos-hmi/?display=salon`.

Add `&screen=<id>` to open on one of the layout's screens, for example a
second monitor that always shows the tanks.

A display set to **show values only** never switches anything, whoever
taps it.

## Hardware

A Raspberry Pi 5 or better, or any PC, with Chromium in kiosk mode:

```bash
chromium --kiosk --noerrdialogs --disable-pinch \
  "http://<signalk-server>:3000/signalk-espos-hmi/?display=helm"
```

The page asks the browser to keep the screen awake while it is open. The
browser grants that only on HTTPS or `localhost` and may release it, so a
kiosk on plain HTTP should also turn off screen blanking in the operating
system.

## Access

Viewing needs read access to the server. Switching sends a Signal K PUT
as the signed-in user, so with security on, the display's user needs
read/write access. Pushing a layout needs admin, as in the designer.
Servers too old to offer per-route access control gate none of the
routes below.

## Routes

Under `/plugins/signalk-espos-hmi`:

| Route                       | Access | What                                                  |
| --------------------------- | ------ | ----------------------------------------------------- |
| `GET /displays`             | read   | The configured displays with their size               |
| `GET /displays/:id/hello`   | read   | The same capability descriptor a panel serves         |
| `GET /displays/:id/layout`  | read   | The display's layout, or the starter                  |
| `POST /displays/:id/layout` | admin  | Store a layout; answers like a panel's `POST /layout` |
| `GET /displays/:id/events`  | read   | Server-sent `layout` events when a new layout arrives |

## Develop

```bash
npm install
npm run dev     # Vite, proxying /signalk and /plugins to $SIGNALK_DEV_URL
npm run build   # plugin to dist/, page to public/
npm test
npm run ci-lint
```

`scripts/copy-wasm.sh` stages the renderer from a sibling
`espos-p4-cockpit-wasm` checkout, or fetches the pinned commit.

## Licence

Apache License 2.0.
