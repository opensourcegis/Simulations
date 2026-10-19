import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

const cdpBase = process.env.RANGING_CDP_URL || "http://localhost:9222";
const siteBase =
  process.env.RANGING_BASE_URL || "http://localhost:4173/Simulations/";
const tab = await (
  await fetch(cdpBase + "/json/new?about:blank", { method: "PUT" })
).json();
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
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
  new Promise((resolve) => {
    const next = ++id;
    pending.set(next, resolve);
    socket.send(JSON.stringify({ id: next, method, params }));
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
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const screenshot = async (path) => {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(path, Buffer.from(r.result.data, "base64"));
};

try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Page.navigate", { url: siteBase + "?simulation=lidar-ranging" });
  for (let n = 0; n < 50; n++) {
    if (await evaluate(`!!document.getElementById('rng-hardware-title')`))
      break;
    await pause(100);
  }
  assert(await evaluate(`!!document.getElementById('rng-hardware-title')`));
  await evaluate(
    `window.rangeTest={wait:ms=>new Promise(r=>setTimeout(r,ms)),set:(id,value)=>{const el=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));}}`,
  );

  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    for (const mode of ["pulsed", "phase", "multi"]) {
      const layout = await evaluate(
        `(async()=>{document.getElementById('rng-tab-${mode}').click();await rangeTest.wait(70);return {overflow:document.documentElement.scrollWidth>innerWidth,canvases:document.querySelectorAll('canvas').length,components:document.querySelectorAll('.rng-part-buttons button').length};})()`,
      );
      assert(!layout.overflow, `${width}/${mode} page overflow`);
      assert(layout.canvases >= 2);
      assert.equal(layout.components, 7);
    }
    console.log(`${width}px: all three modes and cutaway layout passed`);
  }

  await evaluate(
    `(async()=>{document.getElementById('rng-tab-pulsed').click();await rangeTest.wait(60);rangeTest.set('rng-speed',4);})()`,
  );
  const components = await evaluate(
    `(async()=>{const results=[];for(const b of document.querySelectorAll('.rng-part-buttons button')){b.click();await rangeTest.wait(30);results.push({selected:b.getAttribute('aria-pressed'),title:document.querySelector('.rng-part-explanation h3').textContent,button:b.textContent.slice(2)});}return results;})()`,
  );
  for (const part of components) {
    assert.equal(part.selected, "true");
    assert.equal(part.title, part.button);
  }
  console.log("All seven inspectable component explanations passed.");

  const fire = async () => {
    await evaluate(`document.getElementById('rng-hardware-fire').click()`);
    assert(
      (
        await evaluate(`document.getElementById('rng-result').textContent`)
      ).includes("—"),
    );
    for (let n = 0; n < 80; n++) {
      if (
        !(
          await evaluate(`document.getElementById('rng-detection').textContent`)
        ).includes("Awaiting")
      )
        break;
      await pause(100);
    }
    return evaluate(
      `({value:document.getElementById('rng-result').textContent,status:document.getElementById('rng-detection').textContent})`,
    );
  };
  const valid = await fire();
  assert(valid.status.includes("valid return"));
  assert(Math.abs(parseFloat(valid.value) - 120) < 0.5);
  const trace = await evaluate(
    `document.querySelector('.rng-trace canvas').toDataURL()`,
  );
  await pause(120);
  assert.equal(
    await evaluate(`document.querySelector('.rng-trace canvas').toDataURL()`),
    trace,
    "captured noise must not shimmer",
  );
  await fire();
  assert.notEqual(
    await evaluate(`document.querySelector('.rng-trace canvas').toDataURL()`),
    trace,
    "a new shot must change the noise",
  );

  await evaluate(
    `(async()=>{rangeTest.set('rng-distance',300);await rangeTest.wait(60);})()`,
  );
  const weak = await fire();
  assert(weak.status.includes("No valid return"));
  assert(weak.value.includes("—"));
  await evaluate(
    `(async()=>{rangeTest.set('rng-aperture',80);await rangeTest.wait(60);})()`,
  );
  const recovered = await fire();
  assert(recovered.status.includes("valid return"));
  assert(Math.abs(parseFloat(recovered.value) - 300) < 1);
  console.log(
    "Shot lifecycle, stable captures, weak-return rejection and aperture recovery passed.",
    { valid, weak, recovered },
  );

  for (const [input, value] of [
    ["rng-reflectivity", 10],
    ["rng-ambient", 100],
    ["rng-extinction", 1],
    ["rng-air-index", 1],
    ["rng-width", 20],
  ]) {
    await evaluate(
      `(async()=>{rangeTest.set('${input}',${value});await rangeTest.wait(60);})()`,
    );
    assert(
      (
        await evaluate(`document.getElementById('rng-result').textContent`)
      ).includes("—"),
      `${input} must invalidate capture`,
    );
    assert(
      (
        await evaluate(`document.getElementById('rng-detection').textContent`)
      ).includes("Awaiting"),
    );
    await fire();
  }
  const keyboard = await evaluate(
    `(async()=>{document.getElementById('rng-tab-pulsed').focus();document.querySelector('.rng-modes').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await rangeTest.wait(60);return document.getElementById('rng-tab-phase').getAttribute('aria-selected');})()`,
  );
  assert.equal(keyboard, "true");
  console.log("Setting invalidation and keyboard method navigation passed.");
  await evaluate(
    `(async()=>{document.getElementById('rng-tab-pulsed').click();await rangeTest.wait(50);for(const [id,v] of [['rng-distance',120],['rng-aperture',30],['rng-reflectivity',35],['rng-ambient',25],['rng-extinction',.15],['rng-air-index',1.00027],['rng-width',10]]){rangeTest.set(id,v);await rangeTest.wait(25);}document.querySelectorAll('.rng-part-buttons button')[5].click();window.scrollTo(0,0);})()`,
  );
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1400,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await pause(100);
  await screenshot("/tmp/ranging-components-desktop.png");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await pause(100);
  await screenshot("/tmp/ranging-components-mobile.png");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log("Ranging browser checks passed with no runtime exceptions.");
} finally {
  socket.close();
  await fetch(cdpBase + "/json/close/" + tab.id);
}
