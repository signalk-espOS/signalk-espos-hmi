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

More screens: open `/signalk-espos-hmi/?settings` (or **Settings** under
the list of displays) as admin and add a display per screen, each with
its size. Changes reach open displays at once. Open a display directly with `?display=<address>`, for example
`/signalk-espos-hmi/?display=salon`.

A display can show another display's layout instead of its own: pick
that display under **Layout**. A push to it then reaches every display
that follows it, each letterboxed to its own size, and the designer
cannot push to a follower on its own.

Add `screen=<id>` to the address to open on one of the layout's screens
(`?screen=tanks`, or `?display=salon&screen=tanks`), for example a
second monitor that starts on the tanks. A new layout opens on that screen
again.

A display set to **show values only** never switches anything, whoever
taps it. Its tabs and swipes still change the screen; lists on it do not
scroll.

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

| Route                       | Access | What                                                                                              |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `GET /displays`             | read   | The configured displays with their size and `layoutFrom`                                          |
| `GET /displays/:id/hello`   | read   | The same capability descriptor a panel serves                                                     |
| `GET /displays/:id/layout`  | read   | The layout the display shows, or the starter                                                      |
| `POST /displays/:id/layout` | admin  | Store a layout; answers like a panel's `POST /layout`, 409 on a follower                          |
| `GET /settings`             | admin  | The displays as set up, and the screen sizes to choose from                                       |
| `PUT /settings`             | admin  | Save the displays; open pages start again with them                                               |
| `GET /displays/:id/events`  | read   | Server-sent `layout` events when the layout it shows changes, `settings` when the displays change |

## Develop

```bash
npm install
npm run dev     # Vite, proxying /signalk and /plugins to $SIGNALK_DEV_URL
npm run build   # plugin to dist/, page to public/
npm test
npm run ci-lint
```

`scripts/copy-wasm.sh` stages the renderer from a sibling
`espos-p4-cockpit-wasm` checkout, or fetches the pinned commit. Keep the
sibling at or after that commit: an older bundle has no touch and shows
only the first screen, whatever `?screen=` asks for.

## Licence

Apache License 2.0.
