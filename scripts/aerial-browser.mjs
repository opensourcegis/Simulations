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
  for (let i = 0; i < 120; i++) {
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
const goto = async (route) => {
  await cdp("Page.navigate", { url: siteBase + route });
  await until(`!!document.querySelector('.photo-lab')`);
  await evaluate(
    `window.aerialTest={wait:ms=>new Promise(r=>setTimeout(r,ms)),set:(id,v)=>{const e=document.getElementById(id);Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,String(v));e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));},metric:label=>[...document.querySelectorAll('dt')].find(e=>e.textContent===label)?.nextElementSibling.textContent};`,
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
  for (const route of [
    "?simulation=block-adjustment",
    "?simulation=sfm",
    "?simulation=aerial-triangulation",
  ]) {
    await resize(1440);
    await goto(route);
    assert.equal(
      await evaluate(`document.querySelectorAll('.photo-webgl canvas').length`),
      route.includes("simulation=sfm") ? 0 : 1,
    );
    if (route.includes("simulation=sfm")) {
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.sfm-seed-images canvas').length",
        ),
        2,
      );
      assert(
        await evaluate(
          "document.getElementById('sfm-start').checkVisibility()",
        ),
      );
    }
    if (route.includes("aerial-triangulation"))
      await evaluate(
        `[...document.querySelectorAll('.photo-tabs button')].find(b=>b.textContent.includes('Image measurements')).click()`,
      );
    for (const width of [1920, 1440, 1024, 768, 390, 320]) {
      await resize(width);
      await pause(100);
      assert(
        !(await evaluate(`document.documentElement.scrollWidth>innerWidth`)),
        route + " overflow " + width,
      );
    }
    console.log(route + ": WebGL and six responsive layouts passed");
  }
  await resize(1440);
  await goto("?simulation=block-adjustment");
  const bundle = await evaluate(
    `(async()=>{const initial=parseFloat(document.getElementById('ba-rms').textContent);for(let i=0;i<14;i++){document.getElementById('ba-step').click();await aerialTest.wait(110);}return {initial,fitted:parseFloat(document.getElementById('ba-rms').textContent),checkZ:aerialTest.metric('Independent check Z RMSE')};})()`,
  );
  assert(bundle.fitted < bundle.initial / 10);
  assert(parseFloat(bundle.checkZ) < 0.3);
  console.log("Weighted bundle and independent checks:", bundle);
  await screenshot("/tmp/aerial-bundle-realistic.png");
  await evaluate(
    `(async()=>{aerialTest.set('ba-navigation','off');aerialTest.set('ba-control','none');await aerialTest.wait(100);})()`,
  );
  assert(
    (await evaluate(`document.body.textContent`)).includes(
      "Relative model only",
    ),
  );
  await evaluate(
    `(async()=>{aerialTest.set('ba-control','collinear');await aerialTest.wait(100);})()`,
  );
  assert(
    (await evaluate(`document.body.textContent`)).includes(
      "Collinear control warning",
    ),
  );

  await goto("?simulation=sfm");
  await evaluate(
    "document.getElementById('sfm-empty-state').scrollIntoView({block:'center'})",
  );
  await screenshot("/tmp/sfm-input-evidence.png");
  await evaluate("document.getElementById('sfm-start').click()");
  await until(
    "document.getElementById('sfm-registered').textContent.includes('2 / 6')",
  );
  await until("!!document.querySelector('.photo-webgl canvas')");
  assert.equal(
    await evaluate("!!document.getElementById('sfm-empty-state')"),
    false,
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.photo-webgl-error').length"),
    0,
  );
  await pause(150);
  await screenshot("/tmp/sfm-estimated-seed.png");
  await until("!document.getElementById('sfm-reset').disabled");
  await evaluate("document.getElementById('sfm-reset').click()");
  await until("!!document.getElementById('sfm-empty-state')");
  assert(
    (
      await evaluate(`document.getElementById('sfm-registered').textContent`)
    ).includes("0 / 6"),
  );
  await evaluate(`document.getElementById('sfm-match').click()`);
  await pause(100);
  await evaluate(`document.getElementById('sfm-seed').click()`);
  await until(
    `document.getElementById('sfm-registered').textContent.includes('2 / 6')`,
  );
  for (let n = 3; n <= 6; n++) {
    await until(`!document.getElementById('sfm-grow').disabled`);
    await evaluate(`document.getElementById('sfm-grow').click()`);
    await until(
      `document.getElementById('sfm-registered').textContent.includes('${n} / 6')`,
    );
  }
  const sfm = await evaluate(
    `({registered:document.getElementById('sfm-registered').textContent,rms:parseFloat(document.getElementById('sfm-rms').textContent),points:parseInt(document.getElementById('sfm-points').textContent)})`,
  );
  assert(sfm.rms < 0.7);
  assert(sfm.points > 30);
  await screenshot("/tmp/aerial-sfm-realistic.png");
  console.log("Image-initialised incremental SfM:", sfm);
  await evaluate(
    `(async()=>{aerialTest.set('sfm-noise',1);await aerialTest.wait(150);})()`,
  );
  assert(
    (
      await evaluate(`document.getElementById('sfm-registered').textContent`)
    ).includes("0 / 6"),
  );

  await goto("?simulation=aerial-triangulation");
  await evaluate(
    `[...document.querySelectorAll('.photo-tabs button')].find(b=>b.textContent.includes('Image measurements')).click()`,
  );
  await pause(150);
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.aerial-gallery canvas').length`,
    ),
    6,
  );
  const unknowns = await evaluate(
    `parseInt(aerialTest.metric('Active unknowns'))`,
  );
  const clickCanvas = (ci) =>
    evaluate(
      `(()=>{const e=document.querySelectorAll('.aerial-gallery canvas')[${ci}],r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width*.45,clientY:r.top+r.height*.5}));})()`,
    );
  await clickCanvas(0);
  await pause(100);
  assert.equal(
    await evaluate(`parseInt(aerialTest.metric('Active unknowns'))`),
    unknowns,
    "one-image track must remain excluded",
  );
  await clickCanvas(1);
  await pause(100);
  assert.equal(
    await evaluate(`parseInt(aerialTest.metric('Active unknowns'))`),
    unknowns + 3,
    "a second measured ray activates XYZ",
  );
  await evaluate(`document.getElementById('at-detected').click()`);
  await pause(100);
  assert.equal(
    await evaluate(`parseInt(aerialTest.metric('Active unknowns'))`),
    unknowns + 3,
  );
  await evaluate(`document.getElementById('at-populate').click()`);
  await pause(100);
  const at = await evaluate(
    `(async()=>{const initial=parseFloat(document.getElementById('ba-rms').textContent);for(let i=0;i<12;i++){document.getElementById('ba-step').click();await aerialTest.wait(110);}return{initial,fitted:parseFloat(document.getElementById('ba-rms').textContent)};})()`,
  );
  assert(at.fitted < at.initial / 10);
  await screenshot("/tmp/aerial-triangulation-realistic.png");
  console.log(
    "Manual measurement support, synthetic population and actual AT adjustment:",
    at,
  );
  await cdp("Page.navigate", { url: siteBase + "games/aerial-triangulation/" });
  await until(`location.search.includes('simulation=aerial-triangulation')`);
  console.log("Legacy aerial triangulation URL redirects to new lab.");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log("All aerial browser checks passed without runtime exceptions.");
} finally {
  socket.close();
  await fetch(cdpBase + "/json/close/" + tab.id);
}
