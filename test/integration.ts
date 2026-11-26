// Run by the Signal K plugin CI (npm run test:integration) once it has
// started a server with this plugin enabled and an empty configuration.
// The CI only checks that the plugin is listed, which Signal K also does
// for a plugin whose start() threw, so ask the plugin's own routes.
//
// Node runs this file directly (type stripping): erasable TypeScript only.

interface Displays {
  displays: { id: string; w: number; h: number }[];
}

const base = `${process.env.SIGNALK_URL ?? "http://localhost:3000"}/plugins/signalk-espos-hmi`;
const ATTEMPTS = 10;

function fail(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function get(path: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(base + path);
      if (res.ok || attempt === ATTEMPTS) return res;
    } catch (err) {
      if (attempt === ATTEMPTS) fail(`${base + path} failed: ${String(err)}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const res = await get("/displays");
if (!res.ok) fail(`/displays answered ${res.status}`);
const { displays } = (await res.json()) as Displays;
const first = displays[0];
if (!first) fail("no display configured by default");

const layout = await get(`/displays/${first.id}/layout`);
if (!layout.ok) fail(`/displays/${first.id}/layout answered ${layout.status}`);
if (layout.headers.get("X-Layout-Source") !== "starter") {
  fail("a fresh server should get the starter layout");
}
console.log(`signalk-espos-hmi started: ${first.id} ${first.w}x${first.h}`);
