import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";
const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const page = await openBrowserPage(),
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = page.evaluate;
const click = async (selector) => {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await pause(100);
};
const set = async (selector, value) => {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
  );
  await pause(100);
};
const go = async (route) => {
  await page.send("Page.navigate", { url: base + "?simulation=" + route });
  await page.until('!!document.querySelector(".sim-panel")');
};
const metric = (selector, index) =>
  evaluate(
    `parseFloat(document.querySelectorAll(${JSON.stringify(selector)})[${index}].textContent)`,
  );
const screenshot = async (path) => {
  const reply = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(reply.result.data, "base64"));
};
try {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("gnss");
  const east = await metric("#gn-code-result .code b", 0);
  await set("#gn-clock", 1000);
  assert.equal(await metric("#gn-code-result .code b", 0), east);
  await click(".gn-modes button:nth-child(2)");
  assert(await evaluate('!!document.querySelector(".gn-phase-dial svg")'));
  await click(".gn-modes button:nth-child(3)");
  assert.equal(
    await evaluate('!!document.getElementById("gn-phase-result")'),
    false,
    "no fabricated fixed solution before explicit hypothesis",
  );
  await click("#gn-apply-integers");
  const phase = await metric("#gn-phase-result .rtk b", 0),
    fit = await metric("#gn-phase-result .gn-lonrow:last-child b", 0);
  await set("#gn-reference", 3);
  assert.equal(await metric("#gn-phase-result .rtk b", 0), phase);
  await set("#gn-integer-offset", 1);
  assert(
    (await metric("#gn-phase-result .gn-lonrow:last-child b", 0)) > fit * 20,
  );
  await screenshot("/tmp/review-gnss.png");
  await click(".lesson-brief summary");
  for (const width of [1440, 768, 390, 320]) {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await pause(100);
    assert.equal(
      await evaluate("document.documentElement.scrollWidth>innerWidth"),
      false,
      `expanded GNSS overflow at ${width}`,
    );
    if (width === 390) await screenshot("/tmp/review-gnss-mobile.png");
  }
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("gpr");
  await click("#gpr-pause");
  const frame = await evaluate(
    'document.querySelector(".gpr-cross").toDataURL()',
  );
  await pause(250);
  assert.equal(
    await evaluate('document.querySelector(".gpr-cross").toDataURL()'),
    frame,
    "pulse pause freezes actual drawing",
  );
  await click(".gpr-modes button:nth-child(2)");
  await click(".gpr-btn.primary");
  await pause(600);
  await click("#gpr-pause");
  const sweep = await evaluate(
    'document.querySelector(".gpr-btn.primary").parentElement.querySelector("span").textContent',
  );
  assert(!sweep.includes("0.00 /"), "sweep actually acquired positions");
  await pause(200);
  assert.equal(
    await evaluate(
      'document.querySelector(".gpr-btn.primary").parentElement.querySelector("span").textContent',
    ),
    sweep,
  );
  await click(".gpr-modes button:nth-child(3)");
  assert.equal(
    await evaluate('document.body.textContent.includes("continuous wave")'),
    false,
  );
  await go("snell");
  await click(".snell-media:nth-of-type(1) button:nth-of-type(3)");
  await click(".snell-media:nth-of-type(2) button:nth-of-type(1)");
  await set("input[type=range]", 80);
  assert.match(
    await evaluate('document.querySelector(".score-chip").textContent'),
    /TIR/,
  );
  await screenshot("/tmp/review-snell.png");
  await go("sar");
  assert.match(
    await evaluate("document.body.textContent"),
    /Ground-range resolution/,
  );
  await go("map-projections");
  await page.until('!!document.querySelector(".mp-stage canvas")');
  await set(".mp-unfold input", 1);
  assert.equal(
    await evaluate('document.getElementById("mp-area-60").textContent'),
    "4.00×",
  );
  const projections = await evaluate(
    '[...document.querySelectorAll(".mp-pbtn")].map(b=>b.textContent)',
  );
  for (let i = 0; i < projections.length; i++) {
    await click(`.mp-pbtn:nth-child(${i + 1})`);
    const area = await metric("#mp-area-60", 0);
    assert(Number.isFinite(area));
    if ([1, 3, 4].includes(i)) assert.equal(area, 1);
    if (i === 6)
      assert.equal(
        area,
        1.05,
        "azimuthal absolute, not equator-relative, area scale",
      );
  }
  await screenshot("/tmp/review-projections.png");
  await go("iot-twin");
  await page.until(
    'parseFloat(document.getElementById("iot-time").textContent)>1',
  );
  await click("#iot-pause");
  await pause(300);
  const time = await evaluate(
    'document.getElementById("iot-time").textContent',
  );
  await pause(300);
  assert.equal(
    await evaluate('document.getElementById("iot-time").textContent'),
    time,
  );
  assert.match(
    await evaluate('document.getElementById("iot-sample-age").textContent'),
    /s/,
  );
  assert(
    Math.abs((await metric(".iot-kpis div:nth-child(2) b", 0)) - 180) < 11,
  );
  await screenshot("/tmp/review-iot.png");
  await click("#iot-reset");
  await page.until(
    'document.getElementById("iot-time").textContent==="0.00 s"',
  );
  assert.equal(
    await evaluate('document.getElementById("iot-sample-age").textContent'),
    "—",
  );
  await go("beam-footprint");
  await page.until('!!document.querySelector(".beam-stage canvas")');
  assert.equal(
    await evaluate('document.querySelector(".beam-toolbar input").checked'),
    false,
  );
  await go("building-lod");
  await page.until('!!document.querySelector(".lod-stage canvas")');
  assert.equal(
    await evaluate('document.querySelector("input[type=checkbox]").checked'),
    false,
  );
  // Force external data off, keeping the application and local Leaflet online.
  await page.send("Network.enable");
  await page.send("Network.setBlockedURLs", {
    urls: [
      "*cdn.jsdelivr.net*",
      "*arcgisonline.com*",
      "*tile.openstreetmap.org*",
      "*elevation-tiles-prod*",
      "*overpass-api.de*",
    ],
  });
  await page.send("Page.navigate", {
    url: base + "games/survey-mission-designer/",
  });
  await page.until(
    'typeof L!=="undefined" && document.querySelectorAll("#missionTabs button").length===5',
  );
  await page.until(
    'document.getElementById("terrainNote").textContent.includes("unavailable")',
  );
  assert.match(
    await evaluate('document.getElementById("mapConnectivity").textContent'),
    /unavailable/,
  );
  await click("[data-payload=nadir]");
  await click("#toolTakeoff");
  await evaluate('map.fire("click",{latlng:L.latLng(30.3245,78.0339)});true');
  await click("#toolStart");
  await evaluate('map.fire("click",{latlng:L.latLng(30.325,78.034)});true');
  await click("#evalBtn");
  await page.until(
    'document.getElementById("debriefSub").textContent.includes("Provisional")',
  );
  assert.match(
    await evaluate('document.getElementById("debriefCoach").textContent'),
    /Missing elevation evidence/,
  );
  await click("#debriefClose");
  for (let i = 0; i < 5; i++) {
    await click(`#missionTabs button:nth-child(${i + 1})`);
    assert(await evaluate('!!document.querySelector("#briefObjective b")'));
  }
  await page.send("Network.setBlockedURLs", { urls: [] });
  await page.send("Page.navigate", { url: base + "?simulation=ortho" });
  await page.until(
    'location.pathname.endsWith("/games/ortho-rectification/") && !!document.getElementById("orthoCanvas")',
  );
  const orthoBefore = await evaluate(
    'document.getElementById("orthoCanvas").toDataURL()',
  );
  // Original renderer has three distinct elevation-model modes.
  await evaluate('document.querySelector("[data-mode=datum]").click()');
  await pause(200);
  assert.notEqual(
    await evaluate('document.getElementById("orthoCanvas").toDataURL()'),
    orthoBefore,
  );
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  // Explicitly failed WebGL must show a retry/back path, not a blank React root.
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `const context=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:context.call(this,type,...args)};`,
  });
  await page.send("Page.navigate", {
    url: base + "?simulation=beam-footprint",
  });
  await page.until(
    'document.body.textContent.includes("The laboratory could not start")',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".sim-loading a").length'),
    2,
  );
  console.log(
    "GNSS stages/clock/DD hypothesis; GPR pause/sweep; Snell TIR; seven projection scales; IoT timing/reset; stationary 3D; offline mission planner; legacy ortho alias passed.",
  );
} finally {
  await page.close();
}
