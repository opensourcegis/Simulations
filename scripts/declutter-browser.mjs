import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";

const page = await openBrowserPage(),
  base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = page.evaluate;
const resize = async (width) => {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await pause(120);
  assert.equal(
    await evaluate("document.documentElement.scrollWidth>innerWidth"),
    false,
    `overflow at ${width}`,
  );
};
const go = async (route) => {
  await page.send("Page.navigate", { url: base + "?simulation=" + route });
  await page.until(
    '!!document.querySelector("h1") && !document.querySelector(".sim-loading")',
  );
  await pause(150);
};
// Exercise native pointer activation, not .click() on inaccessible hidden controls.
const click = async (selector) => {
  const point = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,visible:e.checkVisibility()}})()`,
  );
  assert(point.visible, `hidden control: ${selector}`);
  assert(
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)}),hit=document.elementFromPoint(${point.x},${point.y});return hit===e||e.contains(hit)})()`,
    ),
    `obscured control: ${selector}`,
  );
  const { x, y } = point;
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await pause(100);
};
const set = async (id, value) => {
  await evaluate(
    `(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await pause(100);
};
const screenshot = async (name) => {
  await evaluate('window.scrollTo({top:0,behavior:"instant"})');
  await pause(100);
  const result = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    `/tmp/declutter-${name}.png`,
    Buffer.from(result.result.data, "base64"),
  );
};
try {
  await page.send("Page.bringToFront");
  await resize(1440);
  await go("least-squares");
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".ls-stage-panel:not([hidden])").length',
    ),
    1,
  );
  assert.equal(
    await evaluate(
      'document.getElementById("ls-pane-observe").checkVisibility()',
    ),
    true,
  );
  const compactHeight = await evaluate("document.body.scrollHeight");
  assert(
    compactHeight < 2600,
    "default worksheet must not be an all-matrices wall",
  );
  await set("ls-value-L1", 2.3467);
  const fit = await evaluate(
    'document.getElementById("ls-summary").textContent',
  );
  await click("#ls-step-equations");
  assert.equal(
    await evaluate(
      'document.getElementById("ls-equation-inspector").checkVisibility()',
    ),
    true,
  );
  assert.equal(
    await evaluate(
      'document.getElementById("ls-pane-observe").checkVisibility()',
    ),
    false,
  );
  await click(".ls-matrix-disclosure>summary");
  assert.equal(
    await evaluate('document.querySelector(".ls-matrix-disclosure").open'),
    true,
  );
  await click("#ls-step-solve");
  assert.equal(
    await evaluate('document.getElementById("ls-solution").checkVisibility()'),
    true,
  );
  await click("#ls-step-quality");
  assert.equal(
    await evaluate('document.getElementById("ls-quality").checkVisibility()'),
    true,
  );
  assert.equal(
    await evaluate('document.getElementById("ls-summary").textContent'),
    fit,
    "view changes cannot alter the adjustment",
  );
  await click("#ls-full-worksheet");
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".ls-stage-panel:not([hidden])").length',
    ),
    4,
  );
  assert((await evaluate("document.body.scrollHeight")) > compactHeight * 1.6);
  await click("#ls-step-observe");
  assert.equal(
    await evaluate('document.getElementById("ls-value-L1").value'),
    "2.3467",
  );
  await screenshot("least-squares-desktop");

  await go("camera-working");
  await page.until('!!document.querySelector(".photo-webgl canvas")');
  assert(
    (await evaluate('document.querySelector(".photo-webgl").clientWidth')) >
      900,
    "no third diagnostic column squeezing the scene",
  );
  assert.equal(
    await evaluate(
      'document.getElementById("camera-shutter").checkVisibility()',
    ),
    false,
  );
  await click(".photo-tabs button:nth-child(3)");
  assert.equal(
    await evaluate(
      'document.getElementById("camera-shutter").checkVisibility()',
    ),
    true,
  );
  await set("camera-shutter", 1000);
  await click(".photo-tabs button:nth-child(1)");
  assert.equal(
    await evaluate('document.getElementById("camera-shutter").value'),
    "1000",
  );
  await screenshot("camera-desktop");
  await resize(390);
  assert.equal(
    await evaluate('document.querySelector(".photo-control-disclosure").open'),
    false,
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".photo-webgl canvas").checkVisibility()',
    ),
    true,
  );
  await click(".photo-control-disclosure>summary");
  await set("camera-focal", 55);
  // The summary retains focus, so Enter should close/reopen the native details.
  await click(".photo-control-disclosure>summary");
  assert.equal(
    await evaluate('document.querySelector(".photo-control-disclosure").open'),
    false,
  );
  await evaluate(
    'document.querySelector(".photo-control-disclosure>summary").focus()',
  );
  await page.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    text: "\r",
    windowsVirtualKeyCode: 13,
  });
  await page.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await page.until('document.querySelector(".photo-control-disclosure").open');
  assert.equal(
    await evaluate('document.getElementById("camera-focal").value'),
    "55",
  );
  await click(".photo-control-disclosure>summary");
  await screenshot("camera-mobile");

  await resize(1440);
  await go("lidar-ranging");
  assert(
    (await evaluate(
      'document.querySelector(".rng-stage canvas").getBoundingClientRect().top',
    )) < 450,
    "pulse scene must not sit below a large console",
  );
  assert.equal(
    await evaluate(
      'document.getElementById("rng-reflectivity").checkVisibility()',
    ),
    false,
  );
  await click("#rng-fire");
  await page.until(
    'document.getElementById("rng-shot-console").dataset.state==="valid"',
  );
  const shot = await evaluate(
    '({seed:document.getElementById("rng-shot-console").dataset.captureSeed,range:document.getElementById("rng-result").textContent})',
  );
  await click(".rng-controls>.lab-disclosure>summary");
  assert.equal(
    await evaluate(
      'document.getElementById("rng-reflectivity").checkVisibility()',
    ),
    true,
  );
  await click(".rng-controls>.lab-disclosure>summary");
  await click(".rng-worked-disclosure>summary");
  assert.equal(
    await evaluate(
      'document.getElementById("rng-math-result").checkVisibility()',
    ),
    true,
  );
  assert.deepEqual(
    await evaluate(
      '({seed:document.getElementById("rng-shot-console").dataset.captureSeed,range:document.getElementById("rng-result").textContent})',
    ),
    shot,
  );
  await screenshot("ranging-desktop");
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await resize(width);
    assert(
      await evaluate(
        '(()=>{const b=document.getElementById("rng-fire"),r=b.getBoundingClientRect();return b.checkVisibility()&&r.width>=44&&r.height>=44})()',
      ),
    );
  }
  await screenshot("ranging-mobile");

  await resize(1440);
  await go("boresight");
  await page.until('!!document.querySelector(".field-webgl canvas")');
  assert(
    (await evaluate(
      'document.querySelector("canvas").getBoundingClientRect().top',
    )) < 500,
  );
  await click(".teaching-controls .lab-disclosure>summary");
  await set("geo-att-0", 10);
  const error = await evaluate(
    'document.getElementById("geo-total").textContent',
  );
  await click(".teaching-controls .lab-disclosure>summary");
  await click(".teaching-controls .lab-disclosure>summary");
  assert.equal(
    await evaluate('document.getElementById("geo-att-0").value'),
    "10",
  );
  assert.equal(
    await evaluate('document.getElementById("geo-total").textContent'),
    error,
  );
  await screenshot("boresight-desktop");

  await go("sbet-trajectory");
  await page.until('!!document.querySelector(".photo-webgl canvas")');
  await set("sbet-time", 7.5);
  const record = await evaluate(
    'document.querySelector("#sbet-record-table").textContent',
  );
  await click(".photo-tabs button:nth-child(2)");
  assert.equal(
    await evaluate(
      'document.getElementById("sbet-worked-update").checkVisibility()',
    ),
    true,
  );
  assert.equal(
    await evaluate('document.getElementById("sbet-playback").dataset.time'),
    "7.50",
  );
  await click(".photo-tabs button:nth-child(4)");
  assert.equal(
    await evaluate('document.getElementById("sbet-export").checkVisibility()'),
    true,
  );
  assert.equal(
    await evaluate('document.querySelector("#sbet-record-table").textContent'),
    record,
  );
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  console.log(
    "Focused worksheets, wider scenes, responsive settings, keyboard disclosure, pulse actions, optional diagnostics and state preservation passed.",
  );
} finally {
  await page.close();
}
