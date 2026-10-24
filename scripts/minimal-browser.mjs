import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";
import { THUMBNAILS } from "../src/thumbnail-catalog.js";

const page = await openBrowserPage();
const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const pause = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = page.evaluate;
const resize = async (width) => {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await pause();
};
const go = async (path) => {
  await page.send("Page.navigate", { url: base + path });
  // Let Chromium replace the execution context before polling the new page.
  await pause(200);
  await page.until(
    'document.readyState === "complete" && !!document.querySelector("h1")',
  );
  await pause(250);
};
const click = async (selector) => {
  const point = await evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    e.scrollIntoView({block:"center",behavior:"instant"});
    const r=e.getBoundingClientRect();
    return {x:r.x+r.width/2, y:r.y+r.height/2, visible:e.checkVisibility()};
  })()`);
  assert(point.visible, `Hidden control: ${selector}`);
  assert(
    await evaluate(
      `(() => {const e=document.querySelector(${JSON.stringify(selector)}),hit=document.elementFromPoint(${point.x},${point.y});return hit===e||e.contains(hit)})()`,
    ),
    `Obscured control: ${selector}`,
  );
  for (const type of ["mousePressed", "mouseReleased"]) {
    await page.send("Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
  }
  await pause();
};
const set = async (selector, value) => {
  await evaluate(
    `(() => {const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event("input",{bubbles:true}))})()`,
  );
  await pause();
};
const screenshot = async (name) => {
  await evaluate('scrollTo({top:0,behavior:"instant"})');
  const result = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    `/tmp/minimal-${name}.png`,
    Buffer.from(result.result.data, "base64"),
  );
};
const overflow = async () =>
  assert.equal(
    await evaluate("document.documentElement.scrollWidth>innerWidth+1"),
    false,
  );

try {
  await page.send("Page.bringToFront");
  await resize(1440);
  await go("");
  assert.equal(
    await evaluate('document.querySelectorAll("a.card").length'),
    Object.keys(THUMBNAILS).length,
  );
  assert.equal(await evaluate('!!document.querySelector(".stats")'), false);
  await screenshot("catalogue");

  for (const [route, id, keys] of [
    ["sar", "sar", ["geometry", "range", "azimuth", "doppler"]],
    ["snell", "optics", ["refraction", "lens", "distortion"]],
  ]) {
    await go(`?simulation=${route}`);
    const original = await evaluate(
      `document.querySelector(".concept-workspace input").value`,
    );
    const diagram = await evaluate(
      'document.querySelector(".concept-workspace canvas").toDataURL()',
    );
    await set(".concept-workspace input", route === "sar" ? 320 : 55);
    const changed = await evaluate(
      'document.querySelector(".concept-workspace input").value',
    );
    assert.notEqual(original, changed);
    assert.notEqual(
      await evaluate(
        'document.querySelector(".concept-workspace canvas").toDataURL()',
      ),
      diagram,
      "Changing an input must redraw the scientific diagram",
    );
    for (const key of keys) {
      await click(`#${id}-step-${key}`);
      assert.equal(
        await evaluate(
          'document.querySelectorAll(".concept-workspace section.sim-panel:not([hidden])").length',
        ),
        1,
      );
      assert(
        await evaluate(
          `document.getElementById("${id}-pane-${key}").checkVisibility()`,
        ),
      );
      const canvas = await evaluate(
        `(() => {const c=document.querySelector("#${id}-pane-${key} canvas");return {w:c.width,h:c.height,data:c.toDataURL().length}})()`,
      );
      assert(
        canvas.w > 0 && canvas.h > 0 && canvas.data > 1000,
        "A focused diagram must stay rendered",
      );
      assert(
        await evaluate(
          `document.querySelector("#${id}-pane-${key} canvas").getBoundingClientRect().width <= 802`,
        ),
        "Focused diagrams must fit at a readable scale",
      );
      for (const width of [768, 390, 320]) {
        await resize(width);
        await overflow();
      }
      await resize(1440);
    }
    await click(".concept-compare");
    assert.equal(
      await evaluate(
        'document.querySelectorAll(".concept-workspace section.sim-panel:not([hidden])").length',
      ),
      keys.length,
    );
    for (const width of [1920, 1440, 1024, 768, 390, 320]) {
      await resize(width);
      await overflow();
    }
    await resize(1440);
    await click(`#${id}-step-${keys[0]}`);
    assert.equal(
      await evaluate(
        'document.querySelector(".concept-workspace input").value',
      ),
      changed,
    );
    await screenshot(route);
  }

  await go("?simulation=gsd");
  assert.equal(
    await evaluate('document.querySelector(".gsd-sample-panel").open'),
    false,
  );
  await click(".photo-tabs button:nth-child(2)");
  assert(await evaluate('document.querySelector(".gsd-sample-panel").open'));
  assert.equal(
    await evaluate('document.querySelector(".gsd-geometry").checkVisibility()'),
    false,
  );
  await set("#gsd-target", 0.8);
  const crop = await evaluate(
    'document.getElementById("gsd-captured").toDataURL()',
  );
  await click(".photo-tabs button:nth-child(1)");
  await click(".gsd-region-panel > summary");
  await click(".gsd-region-picker button:nth-child(32)");
  await click(".photo-tabs button:nth-child(2)");
  assert.equal(
    await evaluate('document.getElementById("gsd-target").value'),
    "0.8",
  );
  assert.equal(
    await evaluate('document.getElementById("gsd-captured").toDataURL()'),
    crop,
  );
  await screenshot("gsd-sampling");

  await go("?simulation=camera-working");
  assert.equal(
    await evaluate('document.querySelector(".camera-preview-panel").open'),
    false,
  );
  await click(".photo-tabs button:nth-child(3)");
  assert(
    await evaluate(
      'document.getElementById("camera-capture").checkVisibility()',
    ),
  );
  await click("#camera-capture");
  await page.until(
    'document.querySelector(".camera-preview-panel").textContent.includes("Readout complete")',
  );

  await resize(390);
  await go("games/lidar-interaction/");
  assert.equal(
    await evaluate('document.querySelector(".surface-controls").open'),
    false,
  );
  assert(
    await evaluate(
      'document.getElementById("sceneCanvas").getBoundingClientRect().top < 650',
    ),
  );
  await click(".surface-controls > summary");
  await set("#angSlider", 35);
  await click(".surface-controls > summary");
  await click(".surface-controls > summary");
  assert.equal(
    await evaluate('document.getElementById("angSlider").value'),
    "35",
  );
  await click("#canopyTab");
  assert.equal(
    await evaluate('document.querySelector(".canopy-controls").open'),
    false,
  );
  await click(".canopy-controls > summary");
  await click("#btnShot");
  await overflow();
  await click(".canopy-controls > summary");
  await screenshot("canopy-phone");
  await resize(1440);
  await click("#surfaceTab");
  assert(await evaluate('document.querySelector(".surface-controls").open'));
  assert.equal(
    await evaluate('document.getElementById("angSlider").value'),
    "35",
  );
  await screenshot("interaction");

  await go("games/ortho-rectification/");
  const views = await evaluate(
    '(()=>{const s=document.getElementById("srcCanvas").getBoundingClientRect(),o=document.getElementById("orthoCanvas").getBoundingClientRect();return {source:s.top,output:o.top}})()',
  );
  assert(
    views.source < 400 && views.output < 450,
    "Source and corrected output should be visible together",
  );
  await click('.mode[data-mode="dtm"]');
  assert(
    await evaluate('document.querySelector(".mode.on").dataset.mode === "dtm"'),
  );
  await click(".ortho-mode-guide > summary");
  assert(await evaluate('document.querySelector(".ortho-mode-guide").open'));
  await screenshot("ortho");

  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  console.log(
    "Minimal catalogue, focused diagrams, compare views, preserved inputs/captures, mobile settings and standalone comparisons passed.",
  );
} finally {
  await page.close();
}
