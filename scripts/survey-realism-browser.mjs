import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const cdpBase = process.env.PHOTO_CDP_URL || "http://localhost:9222",
  siteBase = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const tab = await (
    await fetch(cdpBase + "/json/new?about:blank", { method: "PUT" })
  ).json(),
  socket = new WebSocket(tab.webSocketDebuggerUrl);
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
    const next = ++id;
    pending.set(next, r);
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
const until = async (expression) => {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return;
    await pause(100);
  }
  assert.fail("Timed out: " + expression);
};
const resize = (width) =>
  cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
const goto = async (route, selector) => {
  await cdp("Page.navigate", { url: siteBase + "?simulation=" + route });
  await until(`!!document.querySelector('${selector}')`);
  await evaluate(
    `window.surveyTest={wait:ms=>new Promise(r=>setTimeout(r,ms)),set:(id,v)=>{const e=document.getElementById(id);Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,String(v));e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));}}`,
  );
  await pause(200);
};
const screenshot = async (path) => {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(path, Buffer.from(r.result.data, "base64"));
};
try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  for (const [route, selector] of [
    ["adaptive-tin", "#tin-final"],
    ["boresight", "#geo-horizontal"],
    ["gsd", "#gsd-height"],
  ]) {
    await resize(1440);
    await goto(route, selector);
    assert.equal(
      await evaluate(`document.querySelectorAll('.field-webgl canvas').length`),
      1,
      route + " uses perspective field renderers",
    );
    assert.equal(
      await evaluate(`document.querySelectorAll('.field-error').length`),
      0,
      route + " WebGL initialized",
    );
    const presets = await evaluate(
      `document.querySelector('.field-view-controls>div').children.length`,
    );
    for (let i = 0; i < presets; i++) {
      await evaluate(
        `document.querySelectorAll('.field-view-controls>div button')[${i}].click()`,
      );
      assert.equal(
        await evaluate(
          `document.querySelectorAll('.field-view-controls>div button')[${i}].getAttribute('aria-pressed')`,
        ),
        "true",
      );
    }
    await evaluate(
      `document.querySelector('.field-view-controls button').click()`,
    );
    for (const width of [1920, 1440, 1024, 768, 390, 320]) {
      await resize(width);
      await pause(100);
      assert(
        !(await evaluate(`document.documentElement.scrollWidth>innerWidth`)),
        route + " overflow " + width,
      );
    }
    console.log(route + ": six responsive widths passed");
  }
  await resize(1440);
  await goto("adaptive-tin", "#tin-final");
  const phase = () =>
    evaluate(`document.querySelector('.tin-teaching-panel').dataset.phase`);
  const triangles = () =>
    evaluate(
      `+document.querySelector('.tin-teaching-panel').dataset.triangleCount`,
    );
  assert.equal(await phase(), "cloud");
  assert.equal(await triangles(), 0);
  await evaluate(`document.getElementById('tin-lesson-next').click()`);
  assert.equal(await phase(), "cells");
  await evaluate(`document.getElementById('tin-lesson-next').click()`);
  assert.equal(await phase(), "seeds");
  assert.equal(await triangles(), 0);
  assert(
    (await evaluate(
      `+document.querySelector('.tin-teaching-panel').dataset.groundCount`,
    )) > 0,
  );
  await evaluate(`document.getElementById('tin-lesson-next').click()`);
  assert.equal(await phase(), "initial");
  assert.equal(await triangles(), 1);
  await evaluate(`document.getElementById('tin-jump-test').click()`);
  assert.equal(await phase(), "test");
  const beforeDefer = await triangles();
  await evaluate(`document.getElementById('tin-lesson-next').click()`);
  assert.equal(await phase(), "decision");
  assert.equal(await triangles(), beforeDefer);
  assert(
    (
      await evaluate(
        `document.getElementById('tin-event-decision').textContent`,
      )
    ).includes("Defer"),
  );
  await evaluate(`document.getElementById('tin-next-candidate').click()`);
  assert.equal(await phase(), "test");
  const preInsert = await evaluate(
    `+document.querySelector('.tin-teaching-panel').dataset.groundCount`,
  );
  await evaluate(`document.getElementById('tin-lesson-next').click()`);
  assert.equal(await phase(), "decision");
  await evaluate(`document.getElementById('tin-lesson-next').click()`);
  assert.equal(await phase(), "retriangulate");
  assert.equal(
    await evaluate(
      `+document.querySelector('.tin-teaching-panel').dataset.groundCount`,
    ),
    preInsert + 1,
  );
  await evaluate(
    `document.querySelector('.field-viewport').scrollIntoView({block:'center'})`,
  );
  await screenshot("/tmp/tin-teaching-insertion.png");
  for (const name of [
    "Measured returns",
    "Recovered terrain",
    "Survey context",
  ]) {
    await evaluate(
      `[...document.querySelectorAll('.field-modebar button')].find(b=>b.textContent==='${name}').click()`,
    );
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('.field-modebar button')].find(b=>b.textContent==='${name}').getAttribute('aria-pressed')`,
      ),
      "true",
    );
  }
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Switch to 2D Plan')).click()`,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('canvas#tin-plan').length`),
    1,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Switch to 3D View')).click()`,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.field-webgl canvas').length`),
    1,
    "returning to 3D recreates the renderer",
  );
  await evaluate(`document.querySelectorAll('.scenario-card')[3].click()`);
  await until(
    `parseInt(document.getElementById('tin-screened').textContent)>0`,
  );
  await evaluate(`document.getElementById('tin-final').click()`);
  await pause(150);
  const screened = await evaluate(
    `({rmse:parseFloat(document.getElementById('tin-dtm-rmse').textContent),coverage:parseFloat(document.getElementById('tin-coverage').textContent),screened:parseInt(document.getElementById('tin-screened').textContent)})`,
  );
  assert(screened.rmse < 0.3);
  assert(screened.coverage > 0 && screened.coverage < 100);
  await evaluate(`document.getElementById('tin-remove-low').click()`);
  await pause(400);
  await evaluate(`document.getElementById('tin-final').click()`);
  await pause(100);
  const contaminated = await evaluate(
    `parseFloat(document.getElementById('tin-dtm-rmse').textContent)`,
  );
  assert(contaminated > screened.rmse * 5);
  await evaluate(
    `(async()=>{document.getElementById('tin-remove-low').click();await surveyTest.wait(400);document.getElementById('tin-final').click();document.getElementById('tin-point').value='0';document.getElementById('tin-point').dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await screenshot("/tmp/tin-realism.png");
  await evaluate(
    `(async()=>{surveyTest.set('tin-distance',.8);await surveyTest.wait(300);})()`,
  );
  assert(
    (
      await evaluate(`document.querySelector('.tin-step-progress').textContent`)
    ).includes("Iteration 0 /"),
    "changing classification settings resets history playback",
  );
  console.log("TIN support and low-outlier experiment:", {
    screened,
    contaminated,
  });

  await goto("boresight", "#geo-horizontal");
  assert.equal(
    await evaluate(`document.querySelectorAll('.field-webgl canvas').length`),
    1,
    "one shared observation view",
  );
  const total = () =>
    evaluate(`parseFloat(document.getElementById('geo-total').textContent)`);
  assert((await total()) > 100, "lever lesson starts with omitted translation");
  const trueHit = await evaluate(
    `document.getElementById('geo-actual').textContent`,
  );
  await evaluate(`document.getElementById('geo-use-lever').click()`);
  assert((await total()) < 0.01);
  assert.equal(
    await evaluate(`document.getElementById('geo-actual').textContent`),
    trueHit,
    "correction does not move actual hit",
  );
  await evaluate(`document.getElementById('geo-stage-boresight').click()`);
  assert((await total()) > 100);
  const mount = await evaluate(`document.getElementById('geo-mount-0').value`),
    boreHit = await evaluate(
      `document.getElementById('geo-actual').textContent`,
    );
  await evaluate(`document.getElementById('geo-use-bore').click()`);
  assert((await total()) < 0.01);
  assert.equal(
    await evaluate(`document.getElementById('geo-mount-0').value`),
    mount,
  );
  assert.equal(
    await evaluate(`document.getElementById('geo-actual').textContent`),
    boreHit,
  );
  await evaluate(`document.getElementById('geo-stage-attitude').click()`);
  assert((await total()) > 100);
  await evaluate(`document.getElementById('geo-use-attitude').click()`);
  assert((await total()) < 0.01);
  await evaluate(
    `surveyTest.set('geo-latency',10);surveyTest.set('geo-range',5);document.getElementById('geo-preset-zero').click()`,
  );
  assert(
    (await total()) < 0.01,
    "zero-boresight experiment resets unrelated residuals",
  );
  await evaluate(`document.getElementById('geo-preset-yaw-nadir').click()`);
  assert((await total()) < 0.01);
  await evaluate(`document.getElementById('geo-preset-yaw-scan').click()`);
  assert((await total()) > 100);
  await evaluate(
    `document.querySelector('.teaching-geometry').scrollIntoView({block:'start'})`,
  );
  await screenshot("/tmp/boresight-teaching-yaw.png");
  await evaluate(`document.getElementById('geo-perfect').click()`);
  await pause(100);
  assert(
    parseFloat(
      await evaluate(`document.getElementById('geo-horizontal').textContent`),
    ) < 0.01,
  );
  await evaluate(
    `(async()=>{surveyTest.set('geo-latency',10);await surveyTest.wait(100);})()`,
  );
  const moving = await evaluate(
    `parseFloat(document.getElementById('geo-horizontal').textContent)`,
  );
  assert(moving > 20);
  await evaluate(
    `(async()=>{surveyTest.set('geo-speed',0);surveyTest.set('geo-rate',0);await surveyTest.wait(100);})()`,
  );
  assert(
    parseFloat(
      await evaluate(`document.getElementById('geo-horizontal').textContent`),
    ) < 0.01,
  );
  await evaluate(`document.getElementById('geo-use-lever').click()`);
  await pause(100);
  const omitted = await evaluate(
    `parseFloat(document.getElementById('geo-horizontal').textContent)`,
  );
  assert(omitted > 20);
  await screenshot("/tmp/boresight-realism.png");
  console.log("Georeferencing zero calibration, latency and omitted lever:", {
    moving,
    omitted,
  });

  await goto("gsd", "#gsd-captured");
  assert.equal(
    await evaluate(`document.querySelectorAll('.field-webgl canvas').length`),
    1,
  );
  await evaluate(`document.getElementById('gsd-nadir').click()`);
  await pause(150);
  const nadir = parseFloat(
    await evaluate(`document.getElementById('gsd-local').textContent`),
  );
  assert(Math.abs(nadir - 1.2) < 0.02);
  await evaluate(
    `(async()=>{surveyTest.set('gsd-height',200);await surveyTest.wait(150);})()`,
  );
  assert(
    Math.abs(
      parseFloat(
        await evaluate(`document.getElementById('gsd-local').textContent`),
      ) -
        2 * nadir,
    ) < 0.02,
  );
  await evaluate(
    `(async()=>{surveyTest.set('gsd-focal',16);surveyTest.set('gsd-target',.1);surveyTest.set('gsd-speed',0);await surveyTest.wait(150);})()`,
  );
  const image = await evaluate(
      `document.getElementById('gsd-captured').toDataURL()`,
    ),
    geometry = await evaluate(
      `document.getElementById('gsd-local').textContent`,
    );
  await evaluate(
    `(async()=>{surveyTest.set('gsd-phase',.4);await surveyTest.wait(150);})()`,
  );
  assert.notEqual(
    await evaluate(`document.getElementById('gsd-captured').toDataURL()`),
    image,
  );
  assert.equal(
    await evaluate(`document.getElementById('gsd-local').textContent`),
    geometry,
  );
  await evaluate(`document.getElementById('gsd-noise').click()`);
  await pause(150);
  const noisy = await evaluate(
    `document.getElementById('gsd-captured').toDataURL()`,
  );
  await pause(150);
  assert.equal(
    await evaluate(`document.getElementById('gsd-captured').toDataURL()`),
    noisy,
  );
  await evaluate(`document.getElementById('gsd-new-sample').click()`);
  await pause(150);
  assert.notEqual(
    await evaluate(`document.getElementById('gsd-captured').toDataURL()`),
    noisy,
  );
  await evaluate(
    `(async()=>{surveyTest.set('gsd-tilt',70);surveyTest.set('gsd-slope',-25);await surveyTest.wait(150);document.querySelectorAll('.gsd-region-picker button')[35].click();await surveyTest.wait(150);})()`,
  );
  assert(
    (
      await evaluate(`document.getElementById('gsd-validity').textContent`)
    ).includes("No forward intersection"),
  );
  await evaluate(
    `(async()=>{document.getElementById('gsd-nadir').click();surveyTest.set('gsd-height',100);surveyTest.set('gsd-focal',50);surveyTest.set('gsd-tilt',30);surveyTest.set('gsd-target',.5);await surveyTest.wait(150);document.querySelectorAll('.gsd-region-picker button')[31].click();await surveyTest.wait(100);window.scrollTo(0,0);})()`,
  );
  await screenshot("/tmp/gsd-realism.png");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    "GSD scaling, fractional sampling, stable seeded noise, horizon rejection and WebGL passed.",
  );
  console.log(
    "All survey-realism browser checks passed without runtime exceptions.",
  );
} finally {
  socket.close();
  await fetch(cdpBase + "/json/close/" + tab.id);
}
