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
  for (const [route, selector] of [
    ["lidar-ranging", ".rng-mathline"],
    ["gsd", ".gsd-geometry"],
    ["adaptive-tin", ".tin-simple"],
  ]) {
    await resize(1440);
    await cdp("Page.navigate", { url: base + "?simulation=" + route });
    await until(`!!document.querySelector('${selector}')`);
    for (const width of [1920, 1440, 1024, 768, 390, 320]) {
      await resize(width);
      await pause(100);
      assert.equal(
        await evaluate("document.documentElement.scrollWidth>innerWidth"),
        false,
        route + " overflow " + width,
      );
    }
    await resize(1440);
    await pause(100);
    if (route === "lidar-ranging") {
      assert.equal(
        await evaluate("document.getElementById('rng-anatomy').open"),
        false,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.rng-hardware').checkVisibility()",
        ),
        false,
      );
      assert.match(
        await evaluate(
          "document.getElementById('rng-math-result').textContent",
        ),
        /No measured range/,
      );
    }
    if (route === "gsd") {
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.field-webgl canvas').length",
        ),
        0,
      );
      assert.match(
        await evaluate(
          "document.getElementById('gsd-reference-calculation').textContent",
        ),
        /1.20 cm\/px/,
      );
      await set("gsd-tilt", 0);
      assert.match(
        await evaluate(
          "document.getElementById('gsd-actual-calculation').textContent",
        ),
        /1.20 × 1.20/,
      );
      await set("gsd-height", 200);
      assert.match(
        await evaluate(
          "document.getElementById('gsd-actual-calculation').textContent",
        ),
        /2.40 × 2.40/,
      );
      await set("gsd-tilt", 40);
      const before = await evaluate(
        "document.getElementById('gsd-actual-calculation').textContent",
      );
      await click(".gsd-sampling-bars button:last-child");
      assert.notEqual(
        await evaluate(
          "document.getElementById('gsd-actual-calculation').textContent",
        ),
        before,
      );
      await set("gsd-height", 100);
      await set("gsd-tilt", 20);
      await click(".gsd-sampling-bars button:nth-child(5)");
    }
    if (route === "adaptive-tin") {
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.tin-simple-stages button').length",
        ),
        5,
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#tin-simple-plan polygon').length",
        ),
        0,
      );
      await click("#tin-simple-step-1");
      const initialMesh = await evaluate(
        "[...document.querySelectorAll('#tin-simple-plan polygon')].map(e=>e.getAttribute('points'))",
      );
      assert(initialMesh.length > 0);
      await click("#tin-simple-step-2");
      assert.match(
        await evaluate(
          "document.getElementById('tin-simple-decision').textContent",
        ),
        /Both tests pass/,
      );
      await click("#tin-simple-step-3");
      assert.match(
        await evaluate(
          "document.querySelector('.tin-simple-current').textContent",
        ),
        /replaced by/,
      );
      await click(".tin-simple-choice button:last-child");
      assert.match(
        await evaluate(
          "document.getElementById('tin-simple-decision').textContent",
        ),
        /fails/,
      );
      assert.match(
        await evaluate(
          "document.querySelector('.tin-simple-current').textContent",
        ),
        /triangles stay unchanged/,
      );
      await click("#tin-final");
      assert.notEqual(
        await evaluate(
          "document.getElementById('tin-simple-coverage').textContent",
        ),
        "—",
      );
      await set("tin-simple-distance", 2);
      assert.equal(
        await evaluate(
          "document.getElementById('tin-simple-step-0').getAttribute('aria-current')",
        ),
        "step",
      );
      await click("#tin-open-advanced");
      await until("!!document.getElementById('tin-return-simple')");
      assert.equal(
        await evaluate("document.getElementById('tin-adaptive').checked"),
        false,
      );
      await click("#tin-return-simple");
      assert.equal(
        await evaluate("document.getElementById('tin-simple-distance').value"),
        "2",
      );
      await click("#tin-simple-step-2");
    }
    const screenshot = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(
      "/tmp/compact-" + route + ".png",
      Buffer.from(screenshot.result.data, "base64"),
    );
    console.log(
      route +
        ": compact default, numerical interaction and six responsive widths passed",
    );
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
} finally {
  socket.close();
  await fetch(debug + "/json/close/" + tab.id);
}
