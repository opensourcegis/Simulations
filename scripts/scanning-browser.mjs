import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const debug = process.env.PHOTO_CDP_URL || "http://localhost:9222";
const tab = await (
  await fetch(debug + "/json/new?about:blank", { method: "PUT" })
).json();
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => socket.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map(),
  errors = [];
socket.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.exceptionThrown")
    errors.push(m.params.exceptionDetails);
});
const cdp = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pending.set(n, r);
    socket.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) => {
  const r = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  assert(!r.result.exceptionDetails, JSON.stringify(r));
  return r.result.result.value;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(expression) {
  for (let n = 0; n < 100; n++) {
    if (await evaluate(expression)) return;
    await pause(100);
  }
  assert.fail("Timed out: " + expression);
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await pause(80);
}
async function set(control, value) {
  await evaluate(
    `(()=>{const e=document.getElementById('${control}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${value}');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await pause(100);
}
const resize = (width) =>
  cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });

try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await resize(1440);
  await cdp("Page.navigate", { url: base + "games/lidar-scanning/" });
  await until("!!document.getElementById('scan-fly')");
  assert(
    await evaluate("location.search.includes('simulation=lidar-scanning')"),
    "legacy URL forwards to the new 3D lab",
  );
  await until("!!document.querySelector('.field-webgl canvas')");
  await pause(300);
  assert.equal(
    await evaluate("document.querySelectorAll('.field-error').length"),
    0,
  );
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await resize(width);
    await pause(120);
    assert.equal(
      await evaluate("document.documentElement.scrollWidth>innerWidth"),
      false,
      "scanning overflow " + width,
    );
    assert(
      await evaluate(
        "(()=>{const b=document.getElementById('scan-fly'),r=b.getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&r.height>=44&&(e===b||b.contains(e));})()",
      ),
      "Fly must be visible and clickable without scrolling " + width,
    );
  }
  await resize(1440);
  await pause(100);
  await set("scan-playback", 2);
  const p = await evaluate(
    "(()=>{const r=document.getElementById('scan-fly').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()",
  );
  await cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...p,
    button: "left",
    clickCount: 1,
  });
  await cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...p,
    button: "left",
    clickCount: 1,
  });
  await until(
    "+document.getElementById('scan-flight-console').dataset.time>0.1",
  );
  assert.equal(
    await evaluate("document.getElementById('scan-fly').disabled"),
    true,
  );
  await click("#scan-pause");
  const paused = await evaluate(
    "document.getElementById('scan-flight-console').dataset.time",
  );
  await pause(300);
  assert.equal(
    await evaluate(
      "document.getElementById('scan-flight-console').dataset.time",
    ),
    paused,
  );
  assert(
    (await evaluate(
      "parseInt(document.getElementById('scan-count').textContent.replaceAll(',',''))",
    )) > 0,
  );
  await click("#scan-fly");
  await pause(250);
  await click("#scan-pause");
  assert(
    (await evaluate(
      "+document.getElementById('scan-flight-console').dataset.time",
    )) > +paused,
  );
  for (const id of ["osc", "poly", "palmer", "risley", "mems", "multi"]) {
    await click("#scan-mech-" + id);
    if (id === "osc") await click("#scan-reset");
    assert.equal(
      await evaluate("document.getElementById('scan-count').textContent"),
      "0",
    );
    await click("#scan-show-all");
    assert(
      (await evaluate(
        "parseInt(document.getElementById('scan-count').textContent.replaceAll(',',''))",
      )) > 1000,
      id + " has real captured points",
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.field-error').length"),
      0,
    );
  }
  await click("#scan-mech-osc");
  await click("#scan-show-all");
  await evaluate(
    "document.querySelector('.field-viewport').scrollIntoView({block:'center'})",
  );
  await pause(300);
  let shot = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    "/tmp/scanning-3d-survey.png",
    Buffer.from(shot.result.data, "base64"),
  );
  await click(".field-view-controls button:nth-child(2)");
  await pause(200);
  shot = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    "/tmp/scanning-3d-payload.png",
    Buffer.from(shot.result.data, "base64"),
  );
  await set("scan-height", 100);
  assert.equal(
    await evaluate("document.getElementById('scan-count').textContent"),
    "0",
  );
  await click("#scan-objects");
  assert.equal(
    await evaluate("document.getElementById('scan-objects').checked"),
    false,
  );
  await click("#scan-show-all");
  await set("scan-time", 2.5);
  const acquisitionBeforeToggle = await evaluate(
    "({time:document.getElementById('scan-flight-console').dataset.time,count:document.getElementById('scan-count').textContent})",
  );
  assert.equal(
    await evaluate("document.getElementById('scan-highlight-sweep').checked"),
    true,
  );
  await click("#scan-highlight-sweep");
  assert.equal(
    await evaluate("document.getElementById('scan-highlight-sweep').checked"),
    false,
  );
  assert.deepEqual(
    await evaluate(
      "({time:document.getElementById('scan-flight-console').dataset.time,count:document.getElementById('scan-count').textContent})",
    ),
    acquisitionBeforeToggle,
    "sweep highlighting cannot change acquired points or playback time",
  );
  await click("#scan-highlight-sweep");
  assert.equal(
    await evaluate(
      "document.getElementById('scan-flight-console').dataset.running",
    ),
    "false",
  );
  assert.equal(
    await evaluate(
      "document.getElementById('scan-flight-console').dataset.time",
    ),
    "2.5",
  );
  await click("#scan-reset");
  assert.equal(
    await evaluate("document.getElementById('scan-count').textContent"),
    "0",
  );
  await cdp("Page.navigate", { url: base + "?simulation=boresight" });
  await until("!!document.getElementById('geo-show-rays')");
  await until("!!document.querySelector('.field-webgl canvas')");
  assert.equal(
    await evaluate("document.getElementById('geo-show-rays').checked"),
    false,
  );
  assert.equal(
    await evaluate("document.getElementById('geo-show-frames').checked"),
    false,
  );
  assert.equal(
    await evaluate("document.getElementById('geo-show-mount-guide').checked"),
    true,
  );
  assert.match(
    await evaluate("document.querySelector('.teaching-geometry').textContent"),
    /not a wire/,
  );
  const actual = await evaluate(
    "document.getElementById('geo-actual').textContent",
  );
  await click("#geo-show-rays");
  await click("#geo-show-mount-guide");
  await click("#geo-show-frames");
  assert.equal(
    await evaluate("document.getElementById('geo-actual').textContent"),
    actual,
    "display guides cannot change physical observations",
  );
  await click("#geo-show-rays");
  await click("#geo-show-mount-guide");
  await click("#geo-show-frames");
  await evaluate(
    "document.querySelector('.teaching-geometry').scrollIntoView({block:'center'})",
  );
  await pause(250);
  shot = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    "/tmp/boresight-mounted-antenna.png",
    Buffer.from(shot.result.data, "base64"),
  );
  await click("#geo-use-lever");
  assert(
    (await evaluate(
      "parseFloat(document.getElementById('geo-total').textContent)",
    )) < 0.001,
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    "3D scanning: six mechanisms, fixed-timestamp acquisition, visible Fly, pause/resume/reset/seek, legacy routing and boresight guide isolation passed.",
  );
} finally {
  socket.close();
  await fetch(debug + "/json/close/" + tab.id);
}
