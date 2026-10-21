import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";
const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/",
  page = await openBrowserPage();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = page.evaluate;
const set = async (id, value) => {
  await evaluate(
    `(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`,
  );
  await pause(100);
};
const click = async (id) => {
  await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  await pause(100);
};
const metric = async (index) =>
  evaluate(
    `parseFloat(document.querySelectorAll('.nav-metrics dd')[${index}].textContent)`,
  );
const screenshot = async (path) => {
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(shot.result.data, "base64"));
};
const resize = (width) =>
  page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
try {
  for (const route of ["imu", "sbet-trajectory"]) {
    await resize(1440);
    await page.send("Page.navigate", { url: `${base}?simulation=${route}` });
    await page.until(
      "!!document.querySelector('.navigation-lab .photo-webgl canvas')",
    );
    await page.until("document.querySelectorAll('.nav-metrics dd').length===4");
    assert.equal(
      await evaluate("document.querySelectorAll('.photo-webgl-error').length"),
      0,
    );
    assert.match(
      await evaluate("document.querySelector('.photo-header').textContent"),
      /INERTIAL NAVIGATION/,
    );
    for (const width of [1920, 1440, 1024, 768, 390, 320]) {
      await resize(width);
      await pause(100);
      assert.equal(
        await evaluate("document.documentElement.scrollWidth>innerWidth"),
        false,
        `${route} overflow at ${width}`,
      );
    }
    await resize(1440);
    await pause(100);
    if (route === "imu") {
      await set("imu-noise", 0);
      await set("imu-accel-bias", 0);
      await set("imu-time", 20);
      const drift = await metric(2);
      assert(Math.abs(drift) > 1);
      await click("imu-calibrate");
      await set("imu-time", 20);
      assert(Math.abs(await metric(2)) < Math.abs(drift) / 10);
      await set("imu-preset", "tilt");
      assert(Math.abs((await metric(0)) - 9.807) < 0.001);
      await set("imu-preset", "accelerate");
      await set("imu-time", 20);
      assert((await metric(3)) > 10);
      await set("imu-preset", "freefall");
      assert.equal(await metric(0), 0);
      assert(
        await evaluate(
          "document.querySelector('#imu-force').textContent.includes('m/s²')",
        ),
      );
      await set("imu-preset", "tilt");
      await click("imu-play");
      await page.until(
        "+document.getElementById('imu-playback').dataset.time>.2",
      );
      await click("imu-play");
      const t = await evaluate(
        "document.getElementById('imu-playback').dataset.time",
      );
      await pause(200);
      assert.equal(
        await evaluate("document.getElementById('imu-playback').dataset.time"),
        t,
      );
      await evaluate(
        "document.querySelector('.photo-viewport').scrollIntoView({block:'center'})",
      );
      await screenshot("/tmp/imu-lab.png");
      await click("imu-reset");
      assert.equal(
        await evaluate("document.getElementById('imu-playback').dataset.time"),
        "0.00",
      );
      console.log(
        "IMU: one-g/zero-g measurements, false tilt under acceleration, calibration, playback and six layouts passed.",
      );
    } else {
      assert((await metric(2)) < (await metric(1)));
      assert((await metric(1)) < (await metric(0)));
      await click("sbet-next-update");
      assert.equal(
        await evaluate("document.getElementById('sbet-playback').dataset.time"),
        "1.00",
      );
      assert.match(
        await evaluate(
          "document.getElementById('sbet-worked-update').textContent",
        ),
        /1.00 s/,
      );
      assert.match(
        await evaluate(
          "document.getElementById('sbet-worked-update').textContent",
        ),
        /Applied δEast/,
      );
      await set("sbet-mode", "filtered");
      await set("sbet-time", 39);
      assert.match(
        await evaluate(
          "document.getElementById('sbet-current-status').textContent",
        ),
        /no GNSS/,
      );
      const before = await evaluate(
        "parseFloat(document.getElementById('sbet-sigma').textContent)",
      );
      await set("sbet-time", 40);
      assert(
        (await evaluate(
          "parseFloat(document.getElementById('sbet-sigma').textContent)",
        )) <
          before / 10,
      );
      await click("sbet-outlier");
      assert.equal(
        await evaluate("document.getElementById('sbet-rejected').textContent"),
        "1",
      );
      await set("sbet-time", 46);
      assert.match(
        await evaluate(
          "document.getElementById('sbet-current-status').textContent",
        ),
        /rejected/,
      );
      const gatedError = await evaluate(
        "parseFloat(document.getElementById('sbet-position-error').textContent)",
      );
      await click("sbet-gate");
      await set("sbet-time", 46);
      assert(
        (await evaluate(
          "parseFloat(document.getElementById('sbet-position-error').textContent)",
        )) >
          gatedError + 1,
      );
      const rms = await metric(2),
        unaligned = await evaluate(
          "document.getElementById('sbet-point-error').textContent",
        );
      await set("sbet-offset", 100);
      assert.equal(await metric(2), rms);
      assert.equal(
        await evaluate("document.getElementById('sbet-playback').dataset.time"),
        "46.00",
      );
      assert.notEqual(
        await evaluate(
          "document.getElementById('sbet-point-error').textContent",
        ),
        unaligned,
      );
      await set("sbet-time", 60);
      assert.match(
        await evaluate(
          "document.getElementById('sbet-point-error').textContent",
        ),
        /outside/,
      );
      await set("sbet-offset", 0);
      await click("sbet-outlier");
      await click("sbet-gate");
      await set("sbet-outage", 0);
      assert((await metric(1)) < 1);
      assert.equal(
        await evaluate("document.getElementById('sbet-accepted').textContent"),
        "60",
      );
      await evaluate(
        "(()=>{window.navExport=null;const old=URL.createObjectURL;URL.createObjectURL=b=>{window.navExport=b;return old(b)};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)click.call(this)}})()",
      );
      await click("sbet-export");
      assert.deepEqual(
        await evaluate(
          "(async()=>{const s=(await window.navExport.text()).split('\\n');return [s.length,s[0].split(',').length,s.at(-1).split(',').length]})()",
        ),
        [602, 17, 17],
      );
      await set("sbet-outage", 20);
      await set("sbet-mode", "smoothed");
      await set("sbet-time", 30);
      await evaluate(
        "document.querySelector('.photo-viewport').scrollIntoView({block:'center'})",
      );
      await screenshot("/tmp/sbet-trajectory-lab.png");
      await evaluate(
        "[...document.querySelectorAll('.photo-viewbar button')].find(b=>b.textContent==='Inspect current payload').click()",
      );
      await pause(150);
      await screenshot("/tmp/sbet-payload.png");
      assert.equal(
        await evaluate(
          "document.getElementById('sbet-playback').dataset.playing",
        ),
        "false",
      );
      await evaluate(
        "[...document.querySelectorAll('.photo-viewbar button')].find(b=>b.textContent==='Reset view').click()",
      );
      await resize(390);
      await screenshot("/tmp/sbet-trajectory-mobile.png");
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#sbet-record-table tbody tr').length",
        ),
        17,
      );
      console.log(
        "SBET: actual covariance growth/correction, outlier gate, causal estimates, smoothing, LiDAR timing, CSV and six layouts passed.",
      );
    }
  }
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  console.log("Navigation labs passed without runtime exceptions.");
} catch (error) {
  console.error("Browser errors:", JSON.stringify(page.errors));
  console.error(await page.evaluate("document.body.textContent.slice(0,2500)"));
  throw error;
} finally {
  await page.close();
}
