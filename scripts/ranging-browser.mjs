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
      height: width < 500 ? 700 : 800,
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
      if (mode === "pulsed") {
        const action = await evaluate(
          `(()=>{const b=document.getElementById('rng-fire'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {visible:r.top>=0&&r.bottom<=innerHeight,height:r.height,uncovered:b===hit||b.contains(hit),first:document.querySelector('main button').id,count:document.querySelectorAll('#rng-fire').length};})()`,
        );
        assert(
          action.visible && action.uncovered,
          `${width}px: Fire pulse must be visible and unobscured without scrolling`,
        );
        assert(action.height >= 44);
        assert.equal(action.first, "rng-fire");
        assert.equal(action.count, 1);
        if (width < 800) {
          await evaluate(
            `document.getElementById('rng-aperture').scrollIntoView({block:'center'})`,
          );
          assert(
            await evaluate(
              `(()=>{const b=document.getElementById('rng-fire'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(b===hit||b.contains(hit));})()`,
            ),
            "Fire remains accessible beside scrolled receiver settings",
          );
          await evaluate(`window.scrollTo(0,0)`);
        }
      }
    }
    console.log(`${width}px: all three modes and cutaway layout passed`);
  }

  await evaluate(
    `(async()=>{document.getElementById('rng-tab-pulsed').click();await rangeTest.wait(60);rangeTest.set('rng-speed',4);})()`,
  );
  assert.equal(
    await evaluate(`document.getElementById('rng-anatomy').open`),
    false,
  );
  assert(
    await evaluate(
      `document.querySelector('.rng-shot-console').getBoundingClientRect().top < document.querySelector('.rng-stage').getBoundingClientRect().top && document.querySelector('.rng-mathline').getBoundingClientRect().top > document.querySelector('.rng-trace').getBoundingClientRect().top`,
    ),
  );
  await evaluate(`document.getElementById('rng-anatomy').open=true`);
  const components = await evaluate(
    `(async()=>{const results=[];for(const b of document.querySelectorAll('.rng-part-buttons button')){b.click();await rangeTest.wait(30);results.push({selected:b.getAttribute('aria-pressed'),title:document.querySelector('.rng-part-explanation h3').textContent,button:b.textContent.slice(2)});}return results;})()`,
  );
  for (const part of components) {
    assert.equal(part.selected, "true");
    assert.equal(part.title, part.button);
  }
  console.log("All seven inspectable component explanations passed.");

  const fire = async () => {
    const point = await evaluate(
      `(()=>{const r=document.getElementById('rng-fire').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
    await cdp("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 1,
    });
    assert(await evaluate(`document.getElementById('rng-fire').disabled`));
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
  assert(await evaluate(`document.getElementById('rng-stop').disabled`));
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
  await evaluate(`document.getElementById('rng-fire').click()`);
  await pause(50);
  await evaluate(`document.getElementById('rng-stop').click()`);
  await pause(800);
  assert.equal(
    await evaluate(`document.getElementById('rng-shot-console').dataset.state`),
    "idle",
    "stopping a shot must not later publish its result",
  );
  assert(
    await evaluate(
      `document.getElementById('rng-result').textContent.includes('—')`,
    ),
  );
  assert(await evaluate(`!document.getElementById('rng-fire').disabled`));
  await evaluate(
    `document.getElementById('rng-repeat').click();document.getElementById('rng-fire').click()`,
  );
  let firstSeed;
  for (let n = 0; n < 50; n++) {
    firstSeed = await evaluate(
      `document.getElementById('rng-shot-console').dataset.captureSeed`,
    );
    if (firstSeed) break;
    await pause(100);
  }
  assert(firstSeed, "repeated capture produces a first result");
  let nextSeed = firstSeed;
  for (let n = 0; n < 50; n++) {
    nextSeed = await evaluate(
      `document.getElementById('rng-shot-console').dataset.captureSeed`,
    );
    if (nextSeed !== firstSeed) break;
    await pause(100);
  }
  assert.notEqual(nextSeed, firstSeed, "repeat uses fresh captures");
  await evaluate(`document.getElementById('rng-stop').click()`);
  await pause(800);
  assert(
    await evaluate(
      `!document.getElementById('rng-repeat').checked && !document.getElementById('rng-fire').disabled && document.getElementById('rng-shot-console').dataset.state==='valid'`,
    ),
  );
  assert.equal(
    await evaluate(
      `document.getElementById('rng-shot-console').dataset.captureSeed`,
    ),
    nextSeed,
    "Stop retains the last completed capture without publishing the discarded in-flight shot",
  );
  console.log(
    "Primary action placement, repeat capture and immediate stop passed.",
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
  await screenshot("/tmp/ranging-console-desktop.png");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await pause(100);
  await screenshot("/tmp/ranging-console-mobile.png");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log("Ranging browser checks passed with no runtime exceptions.");
} finally {
  socket.close();
  await fetch(cdpBase + "/json/close/" + tab.id);
}
