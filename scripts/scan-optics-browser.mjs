import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";
import {
  buildScanLine,
  scanPlaybackFrame,
} from "../src/simulations/scanning-model.js";

const page = await openBrowserPage();
const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const evaluate = page.evaluate;
const resize = async (width) => {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await wait();
};
const click = async (selector) => {
  const point = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,visible:e.checkVisibility()}})()`,
  );
  assert(point.visible, selector + " hidden");
  assert(
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)}),hit=document.elementFromPoint(${point.x},${point.y});return hit===e||e.contains(hit)})()`,
    ),
    selector + " obscured",
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await page.send("Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
  await wait();
};
const set = async (id, value) => {
  await evaluate(
    `(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await wait();
};
const inspect = async () => {
  await evaluate(
    "document.getElementById('scan-optics').scrollIntoView({block:'center',behavior:'instant'})",
  );
  await page.until(
    `!!document.getElementById('scan-optics-view').dataset.state&&Math.abs(JSON.parse(document.getElementById('scan-optics-view').dataset.state).time-Number(document.getElementById('scan-flight-console').dataset.time))<1e-9`,
  );
  return evaluate(
    "JSON.parse(document.getElementById('scan-optics-view').dataset.state)",
  );
};
const shot = async (name) => {
  const box = await evaluate(
    "(()=>{const r=document.getElementById('scan-optics').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()",
  );
  const result = await page.send("Page.captureScreenshot", {
    format: "png",
    clip: box,
    captureBeyondViewport: true,
  });
  await writeFile(
    `/tmp/scanning-mechanism-${name}.png`,
    Buffer.from(result.result.data, "base64"),
  );
};
try {
  await page.send("Page.bringToFront");
  await resize(1440);
  await page.send("Page.navigate", {
    url: base + "?simulation=lidar-scanning",
  });
  await wait(200);
  await page.until("!!document.querySelector('#scan-optics-view canvas')");
  let state = await inspect();
  assert.equal(state.pulseTime, null);
  assert.equal(state.time, 0);
  assert.equal(
    await evaluate("document.getElementById('scan-count').textContent"),
    "0",
  );
  for (const id of ["osc", "poly", "palmer", "risley", "mems", "multi"]) {
    await click("#scan-mech-" + id);
    await set("scan-time", 1.07139);
    state = await inspect();
    assert.equal(state.id, id);
    assert.equal(
      await evaluate(
        "document.querySelectorAll('#scan-optics-view canvas').length",
      ),
      1,
    );
    const data = buildScanLine({
        mechanism: id,
        height: 80,
        speed: 10,
        objects: true,
      }),
      frame = scanPlaybackFrame(data, state.time);
    assert.equal(state.pulseTime, frame.pulseTime);
    if (frame.pulseTime !== null) {
      const expected = data.records
        .slice(frame.pulseStart, frame.pulseEnd)
        .map((r) => r.direction);
      assert.equal(state.directions.length, expected.length);
      state.directions.forEach((d, i) =>
        d.forEach((v, j) =>
          assert(
            Math.abs(v - expected[i][j]) < 1e-12,
            "Optic direction differs from its recorded survey ray",
          ),
        ),
      );
    }
    await shot(id);
  }
  await click("#scan-mech-poly");
  await set("scan-optics-phase", 0.96);
  state = await inspect();
  assert.equal(state.pulseTime, null);
  assert.equal(state.directions.length, 0);
  assert.match(
    await evaluate(
      "document.getElementById('scan-optics-readout').textContent",
    ),
    /blanked/,
  );
  await shot("polygon-blanking");
  await click("#scan-mech-osc");
  await set("scan-optics-phase", 0.25);
  state = await inspect();
  assert(state.time > 0);
  assert.equal(
    await evaluate(
      "document.getElementById('scan-flight-console').dataset.running",
    ),
    "false",
  );
  const before = state.time;
  await click("#scan-optics-slow");
  await page.until(
    `Number(document.getElementById('scan-flight-console').dataset.time)>${before + 0.005}`,
  );
  assert.equal(
    await evaluate("document.getElementById('scan-playback').value"),
    "0.05",
  );
  await click("#scan-optics-pause");
  state = await inspect();
  const frozen = state.time;
  await wait(300);
  assert.equal((await inspect()).time, frozen);
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await resize(width);
    await inspect();
    assert.equal(
      await evaluate("document.documentElement.scrollWidth>innerWidth+1"),
      false,
      "overflow " + width,
    );
    assert(
      await evaluate(
        "document.querySelector('#scan-optics-view canvas').getBoundingClientRect().width>180",
      ),
    );
  }
  await click("#scan-inspect-optics");
  assert.equal(
    await evaluate("document.activeElement.id"),
    "scan-optics-heading",
  );
  await click("#scan-show-all");
  await set("scan-optics-phase", 0.25);
  state = await inspect();
  assert(
    state.time < 18 && state.time > 17,
    "Phase inspection must also work after the complete flight line",
  );
  await click("#scan-reset");
  state = await inspect();
  assert.equal(state.time, 0);
  assert.equal(state.pulseTime, null);
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  console.log(
    "Six optical mechanisms: live recorded-ray synchronization, polygon blanking, slow playback, phase seek, pause/reset, keyboard target and six responsive widths passed.",
  );
} finally {
  await page.close();
}
