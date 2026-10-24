import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";
import {
  referencePointExample,
  surveyHierarchyExample,
} from "../src/simulations/survey-principles-model.js";
const page = await openBrowserPage();
const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
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
const click = async (selector) => {
  const p = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,visible:e.checkVisibility()}})()`,
  );
  assert(p.visible, `Hidden control ${selector}`);
  assert(
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)}),hit=document.elementFromPoint(${p.x},${p.y});return hit===e||e.contains(hit)})()`,
    ),
    `Obscured control ${selector}`,
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await page.send("Input.dispatchMouseEvent", {
      type,
      x: p.x,
      y: p.y,
      button: "left",
      clickCount: 1,
    });
  await pause();
};
const set = async (id, value) => {
  await evaluate(
    `(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`,
  );
  await pause();
};
const shot = async (name) => {
  await evaluate('scrollTo({top:0,behavior:"instant"})');
  const r = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    `/tmp/survey-principles-${name}.png`,
    Buffer.from(r.result.data, "base64"),
  );
};
const results = () =>
  evaluate("({...document.getElementById('survey-range-results').dataset})");
const residual = () =>
  evaluate(
    "Number(document.getElementById('survey-independent-check').dataset.residual)",
  );
const overflow = async (label) =>
  assert.equal(
    await evaluate("document.documentElement.scrollWidth>innerWidth+1"),
    false,
    label,
  );
try {
  await page.send("Page.bringToFront");
  await resize(1440);
  await page.send("Page.navigate", { url: base });
  await pause(200);
  await page.until(
    "!!document.querySelector('a.card[href*=survey-principles]')",
  );
  assert(
    await evaluate(
      "document.querySelector('a.card[href*=survey-principles] img').alt.length>35",
    ),
  );
  await click('a.card[href*="survey-principles"]');
  await pause(200);
  await page.until("!!document.getElementById('framework-step-0')");
  assert.equal(
    await evaluate("document.querySelector('h1').textContent"),
    "Two principles of surveying",
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('#framework-hierarchy-plan .sf-marker.sf-primary').length",
    ),
    4,
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('#framework-hierarchy-plan .sf-marker.sf-secondary').length",
    ),
    0,
  );
  assert.equal(
    await evaluate("!!document.getElementById('framework-detail-plan')"),
    false,
  );
  await shot("whole-site");
  await click("#framework-step-1");
  assert.equal(
    await evaluate(
      "document.querySelectorAll('#framework-hierarchy-plan .sf-marker.sf-secondary').length",
    ),
    2,
  );
  assert.equal(
    await evaluate("!!document.getElementById('framework-detail-plan')"),
    false,
  );
  await click("#framework-zone-1");
  assert.match(
    await evaluate(
      "document.getElementById('framework-hierarchy-plan').getAttribute('aria-label')",
    ),
    /Area 2/,
  );
  await shot("local-control");
  await click("#framework-step-2");
  assert.equal(
    await evaluate("!!document.getElementById('framework-detail-plan')"),
    true,
  );
  const detailResult = () =>
    evaluate(
      "({...document.getElementById('framework-detail-results').dataset})",
    );
  for (const zone of [0, 1]) {
    await click(`#framework-zone-${zone}`);
    for (const corner of [0, 1, 2]) {
      await set("framework-corner", corner);
      const actual = await detailResult(),
        expected = surveyHierarchyExample(zone, corner);
      assert(Math.abs(+actual.east - expected.point[0]) < 1e-8);
      assert(Math.abs(+actual.north - expected.point[1]) < 1e-8);
      assert(Math.abs(+actual.range - expected.range) < 1e-8);
    }
  }
  await set("framework-corner", 0);
  await click("#framework-zone-0");
  await shot("detail-survey");
  await click(
    "section[aria-label='Work from whole to part'] > .lab-disclosure > summary",
  );
  assert.match(
    await evaluate(
      "document.getElementById('framework-coordinate-working').textContent",
    ),
    /Eₚ = Eₛ₁/,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('#framework-error-disclosure').open",
    ),
    false,
  );
  await click("#framework-error-disclosure > summary");
  assert.equal(
    await evaluate(
      "document.getElementById('framework-long-outside').textContent",
    ),
    "6",
  );
  assert.equal(
    await evaluate(
      "document.getElementById('framework-local-outside').textContent",
    ),
    "0",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.sp-detail-offset').length"),
    16,
  );
  await shot("whole-to-part");
  await click("#framework-reobserve");
  assert.equal(
    await evaluate(
      "document.getElementById('framework-long-outside').textContent",
    ),
    "0",
  );
  await set("framework-leg", 0);
  await set("framework-error", 6);
  await click(".sp-error-experiment .lab-disclosure > summary");
  assert(
    await evaluate(
      "document.querySelector('.sp-error-experiment .lab-disclosure').textContent.includes('6.000')",
    ),
  );

  await click(
    "section[aria-label='Work from whole to part'] .sp-progress .sp-primary",
  );
  assert.match(
    await evaluate(
      "document.getElementById('survey-range-results').textContent",
    ),
    /Whole circle/,
  );
  await click("#references-step-1");
  assert.equal((await results()).candidates, "2");
  await click("#references-step-2");
  let r = await results();
  await click("#survey-ellipse");
  assert(Math.abs(+r.east - 50) < 1e-8);
  assert(Math.abs(+r.north - 40) < 1e-8);
  await set("survey-baseline", 20);
  const weak = await evaluate(
    "+document.getElementById('survey-error-ellipse').getAttribute('rx')",
  );
  await set("survey-baseline", 80);
  const strong = await evaluate(
    "+document.getElementById('survey-error-ellipse').getAttribute('rx')",
  );
  assert(weak > strong * 2);
  await set("survey-target-north", 0);
  assert.match(
    await evaluate(
      "document.getElementById('survey-geometry-status').textContent",
    ),
    /Singular/,
  );
  assert.equal(
    await evaluate("!!document.getElementById('survey-error-ellipse')"),
    false,
  );
  await set("survey-target-north", 40);
  await click("#references-step-3");
  assert(Math.abs(await residual()) < 1e-8);
  await set("survey-range-error", 4);
  r = await results();
  const expected = referencePointExample({ baseline: 80, rangeError: 4 });
  assert(Math.abs(+r.east - expected.P[0]) < 1e-8);
  assert(Math.abs(+r.north - expected.P[1]) < 1e-8);
  assert(Math.abs(await residual()) > 0.1);
  await shot("independent-check");
  await click("#survey-range-reobserve");
  assert(Math.abs(await residual()) < 1e-8);
  await set("survey-target-north", 4);
  await set("survey-range-error", -8);
  assert.equal((await results()).east, "");
  assert(
    await evaluate("document.querySelector('.sp-warning').checkVisibility()"),
  );
  assert.equal(
    await evaluate(
      "document.getElementById('survey-independent-check').dataset.residual",
    ),
    "",
  );
  await click("#survey-range-reobserve");
  await set("survey-target-north", 40);
  await click(
    "section[aria-label='Fix a point with independent references'] .lab-disclosure > summary",
  );
  assert.match(
    await evaluate(
      "document.getElementById('survey-range-working').textContent",
    ),
    /80.000/,
  );
  await evaluate(
    "document.getElementById('survey-reference-plan').scrollIntoView({block:'center'})",
  );
  await pause();
  const p = await evaluate(
    "(()=>{const svg=document.getElementById('survey-reference-plan'),p=svg.createSVGPoint();p.x=20+(55+50)*3;p.y=20+(90-35)*3;const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y}})()",
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await page.send("Input.dispatchMouseEvent", {
      type,
      ...p,
      button: "left",
      clickCount: 1,
    });
  await pause();
  r = await results();
  assert(Math.abs(+r.east - 55) < 1e-6);
  assert(Math.abs(+r.north - 35) < 1e-6);
  await click(".sp-lab > .photo-tabs button:nth-child(1)");
  assert.equal(
    await evaluate("document.getElementById('framework-error').value"),
    "6",
  );
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await resize(width);
    for (let stage = 0; stage < 3; stage++) {
      await click(`#framework-step-${stage}`);
      await overflow(`framework ${stage} at ${width}`);
    }
    await click(".sp-lab > .photo-tabs button:nth-child(2)");
    for (let stage = 0; stage < 4; stage++) {
      await click(`#references-step-${stage}`);
      await overflow(`references ${stage} at ${width}`);
    }
    await click(".sp-lab > .photo-tabs button:nth-child(1)");
  }
  await resize(390);
  await click("#framework-step-2");
  await shot("framework-phone");
  await click(".sp-lab > .photo-tabs button:nth-child(2)");
  await click("#references-step-2");
  await shot("phone");
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  console.log(
    "Two surveying principles: progressive control hierarchy, two selectable areas, six polar detail solutions, optional error experiment, ambiguous fixes, weak/singular geometry, withheld checks, dragging, retained inputs, expanded maths and six responsive widths passed.",
  );
} finally {
  await page.close();
}
