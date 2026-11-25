# Agent guidance

Signal K plugin and webapp that shows JLP layouts from the espOS HMI
designer in the browser. The renderer is espos-p4-cockpit's LVGL player
compiled to WebAssembly (espos-p4-cockpit-wasm); this repo serves layouts
and wires the renderer to Signal K.

## Layout

- `src/index.ts`: plugin, routes, layout push and the SSE reload.
- `src/config.ts`: settings, `applyDefaults`, JSON schema.
- `src/layout.ts`: the layout envelope check and `boundPaths`; shared with
  the webapp, so it may not use Node.
- `src/starter.ts`: the layout a display shows before a push.
- `src/hello.ts`: the virtual `/hello` and the widget catalog.
- `src/store.ts`: one layout file per display in the data directory.
- `webapp/src/`: the page. `wasm.ts` is the renderer bridge, `signalk.ts`
  the one WebSocket plus REST PUT, `fit.ts` the letterboxing.
- `scripts/copy-wasm.sh`: stages the renderer at a pinned commit.

## Rules

- **Strict TypeScript, ESM only.** NodeNext with `.js` extensions in
  `src/`; the webapp is bundler-resolved. No `any`, no non-null
  assertions.
- **The renderer is not forked here.** Widget behaviour is the cockpit
  firmware's; a fix goes there, then into the wasm bundle, then the pin
  in `copy-wasm.sh` moves.
- **The widget catalog follows the firmware's** `widget_catalog.h`, less
  the kinds that need a panel's hardware. The designer refuses kinds a
  display does not list.
- **One WebSocket per page.** Re-subscribing replaces the set; never open
  a second one.
- **Writes go through the server** as the signed-in user: PUT for values,
  a `state: normal` delta for a notification ACK (PUT to a notification
  path is not wired up in the server).
- **Reading is `access("readonly")`, pushing a layout is admin.** Servers
  without `router.access` gate nothing; keep that fallback.
- `start()` never throws; Signal K calls it with `{}` until the settings
  are saved, which `applyDefaults` turns into one Helm display.
- The page is touch-first: targets of 44 px or more, nothing on hover
  only, no `confirm()`.

## Commands

- `npm run format` first, then `npm run build`, `npm test`,
  `npm run ci-lint`.
- `npm run test:integration` is what the Signal K plugin CI runs against
  a live server.

## Workflow

- Conventional Commits; the PR title is the release-notes line.
  Squash-merge.
- release-please owns the version: never bump `package.json` or tag by
  hand. Merging `chore: release x.y.z` publishes to npm with the renderer
  required (`REQUIRE_WASM=1`).
- No AI attribution in commits, PRs or code.
