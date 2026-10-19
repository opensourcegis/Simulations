import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const cdpBase = process.env.PHOTO_CDP_URL || "http://localhost:9222";
const siteBase =
  process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
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
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
await cdp("Runtime.enable");
await cdp("Page.enable");
const goto = async (path) => {
  await cdp("Page.navigate", { url: siteBase + path });
  await pause(1000);
  await evaluate(
    `window.photoTest={wait:ms=>new Promise(r=>setTimeout(r,ms)),set:(id,value)=>{const el=document.getElementById(id);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));}}`,
  );
};
const screenshot = async (path) => {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(path, Buffer.from(r.result.data, "base64"));
};
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
await goto("");
assert(await evaluate(`!!document.querySelector('a[href*="camera-working"]')`));
await goto("?simulation=block-adjustment");
assert.equal(
  await evaluate(`document.querySelectorAll('.photo-webgl canvas').length`),
  1,
  "bundle WebGL canvas",
);
const bundle = await evaluate(
  `(async()=>{const initial=parseFloat(document.getElementById('ba-rms').textContent);for(let i=0;i<12;i++){document.getElementById('ba-step').click();await photoTest.wait(60);}const fitted=parseFloat(document.getElementById('ba-rms').textContent);photoTest.set('ba-camera',4);await photoTest.wait(60);return {initial,fitted};})()`,
);
assert(bundle.fitted < bundle.initial / 10);
console.log("Bundle real iterations:", bundle);
await screenshot("/tmp/bundle-redesign.png");
const datum = await evaluate(
  `(async()=>{photoTest.set('ba-control','none');await photoTest.wait(80);const relative=document.body.textContent.includes('Relative model only');photoTest.set('ba-control','collinear');await photoTest.wait(80);const collinear=document.body.textContent.includes('Collinear control warning');photoTest.set('ba-control','distributed');await photoTest.wait(80);document.getElementById('ba-outliers').click();await photoTest.wait(80);document.getElementById('ba-robust').click();await photoTest.wait(80);return {relative,collinear};})()`,
);
assert(datum.relative && datum.collinear);
for (const width of [1920, 1440, 1024, 768, 390, 320]) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await pause(100);
  assert(
    !(await evaluate(`document.documentElement.scrollWidth>innerWidth`)),
    `bundle overflow at ${width}`,
  );
}
console.log("Bundle six responsive widths passed.");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
await goto("?simulation=camera-working");
assert.equal(
  await evaluate(`document.querySelectorAll('.photo-webgl canvas').length`),
  1,
  "camera WebGL canvas",
);
const optics = await evaluate(
  `(async()=>{const initial=parseFloat(document.getElementById('camera-blur').textContent);photoTest.set('camera-focus',4);await photoTest.wait(80);const defocus=parseFloat(document.getElementById('camera-blur').textContent);[...document.querySelectorAll('button')].find(b=>b.textContent==='Focus on the object').click();await photoTest.wait(80);const refocused=parseFloat(document.getElementById('camera-blur').textContent);photoTest.set('camera-focal',85);photoTest.set('camera-aperture',1.4);await photoTest.wait(80);[...document.querySelectorAll('.photo-part-buttons button')].find(b=>b.textContent.includes('Image sensor')).click();await photoTest.wait(80);return {initial,defocus,refocused};})()`,
);
assert.equal(optics.initial, 0);
assert(optics.defocus > 1);
assert.equal(optics.refocused, 0);
console.log("Camera focus:", optics);
for (const width of [1920, 1440, 1024, 768, 390, 320]) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  for (let stage = 0; stage < 4; stage++) {
    await evaluate(
      `document.querySelectorAll('.photo-tabs button')[${stage}].click()`,
    );
    await pause(70);
    assert(
      !(await evaluate(`document.documentElement.scrollWidth>innerWidth`)),
      `camera overflow at ${width}/${stage}`,
    );
  }
}
console.log("Camera four stages at six responsive widths passed.");
await evaluate(`photoTest.set('camera-k1',-.4)`);
await pause(100);
await evaluate(`document.getElementById('camera-capture').click()`);
await pause(1500);
assert(
  await evaluate(`document.body.textContent.includes('Readout complete')`),
);
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
await evaluate(
  `document.querySelectorAll('.photo-tabs button')[0].click();photoTest.set('camera-focal',50);photoTest.set('camera-aperture',4);window.scrollTo(0,0)`,
);
await pause(120);
await screenshot("/tmp/camera-lab.png");
await evaluate(
  `[...document.querySelectorAll('button')].find(b=>b.textContent==='Optics close-up').click();document.querySelector('.photo-webgl').scrollIntoView({block:'start'})`,
);
await pause(200);
await screenshot("/tmp/camera-closeup.png");
assert.equal(errors.length, 0, JSON.stringify(errors));
console.log("All photogrammetry browser checks passed; no runtime exceptions.");
socket.close();
await fetch(cdpBase + "/json/close/" + tab.id);
