import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";
const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/",
  page = await openBrowserPage(),
  evaluate = page.evaluate;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const set = async (id, value) => {
  await evaluate(
    `(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`,
  );
  await pause(80);
};
const click = async (id) => {
  await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  await pause(80);
};
const choose = async (label) => {
  await evaluate(
    `[...document.querySelectorAll('.photo-tabs button')].find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`,
  );
  await pause(120);
};
const estimates = () =>
  evaluate(
    "[...document.querySelectorAll('#ls-solution tbody tr')].map(r=>+r.querySelectorAll('td')[2].textContent)",
  );
const objective = () =>
  evaluate("+document.querySelectorAll('#ls-summary b')[3].textContent");
const resize = (width) =>
  page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
const screenshot = async (path) => {
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(shot.result.data, "base64"));
};
try {
  await resize(1440);
  await page.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await page.send("Page.navigate", { url: `${base}?simulation=least-squares` });
  await page.until("!!document.getElementById('ls-solution')");
  assert.match(
    await evaluate("document.querySelector('.photo-header').textContent"),
    /SURVEY ADJUSTMENT/,
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('#ls-observation-table tbody tr').length",
    ),
    6,
  );
  assert(
    await evaluate(
      "[...document.querySelectorAll('.ls-closures b')].every(e=>e.textContent.includes('→ 0.000 mm'))",
    ),
  );
  assert.match(
    await evaluate(
      "document.getElementById('ls-equation-inspector').textContent",
    ),
    /2\.346500 − \(2\.320000\)/,
  );
  const fixed = await estimates(),
    T = await objective();
  await set("ls-value-L2", "-");
  assert.equal(
    await evaluate(
      "document.getElementById('ls-value-L2').getAttribute('aria-invalid')",
    ),
    "true",
  );
  assert.deepEqual(
    await estimates(),
    fixed,
    "incomplete negative input cannot corrupt the numerical problem",
  );
  await set("ls-value-L2", "-0.126");
  assert.notDeepEqual(await estimates(), fixed);
  await set("ls-value-L2", "-0.125");
  assert.deepEqual(await estimates(), fixed);
  await set("ls-sigma-scale", 2);
  assert.deepEqual(await estimates(), fixed);
  assert(Math.abs((await objective()) - T / 4) < 1e-5);
  await set("ls-datum", "free");
  assert.match(
    await evaluate("document.getElementById('ls-rank-error').textContent"),
    /Rank 3 < 4/,
  );
  assert.equal(
    await evaluate("!!document.getElementById('ls-solution')"),
    false,
  );
  assert.match(
    await evaluate(
      "document.getElementById('ls-equation-inspector').textContent",
    ),
    /no adjusted observation/,
  );
  await set("ls-datum", "weighted");
  assert.equal((await estimates()).length, 4);
  await set("ls-inspect", "CTRL0");
  assert.match(
    await evaluate(
      "document.getElementById('ls-equation-inspector').textContent",
    ),
    /Surveyed A height/,
  );
  await click("ls-restore");
  await click("ls-perturb");
  assert.match(
    await evaluate("document.getElementById('ls-global-test').textContent"),
    /above interval/,
  );
  await click("ls-restore");
  await evaluate(
    "document.querySelectorAll('.ls-visual [role=button]')[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
  );
  assert.match(
    await evaluate(
      "document.getElementById('ls-equation-inspector').textContent",
    ),
    /L2/,
  );
  await click("ls-step-equations");
  await evaluate(
    "document.getElementById('ls-equation-inspector').scrollIntoView({block:'start'})",
  );
  await screenshot("/tmp/least-squares-worked-equation.png");
  await click("ls-step-solve");
  await evaluate(
    "document.querySelector('.ls-normal-system').scrollIntoView({block:'center'})",
  );
  await screenshot("/tmp/least-squares-normal-equations.png");
  await evaluate(
    "(()=>{window.lsExport=null;const old=URL.createObjectURL;URL.createObjectURL=b=>{window.lsExport=b;return old(b)};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)click.call(this)}})()",
  );
  await click("ls-export");
  assert.deepEqual(
    await evaluate(
      "(async()=>{const s=(await window.lsExport.text()).split('\\n');return [s.length,s[0].split(',').length]})()",
    ),
    [7, 8],
  );
  for (const label of [
    "Weighted mean",
    "Levelling network",
    "GNSS baselines",
    "GNSS code positioning",
  ]) {
    await choose(label);
    for (const width of [1920, 1440, 1024, 768, 390, 320]) {
      await resize(width);
      await pause(60);
      assert.equal(
        await evaluate("document.documentElement.scrollWidth>innerWidth"),
        false,
        `${label}: overflow at ${width}`,
      );
    }
    await resize(1440);
    assert(!(await evaluate("document.body.textContent.includes('NaN')")));
    if (label === "Weighted mean") {
      const weighted = (await estimates())[0];
      await set("ls-weights", "equal");
      assert(Math.abs((await estimates())[0] - weighted) > 0.0005);
      for (const id of ["H1", "H2", "H3", "H4"]) await click("ls-use-" + id);
      assert.match(
        await evaluate("document.getElementById('ls-rank-error').textContent"),
        /no active observations/i,
      );
    }
    if (label === "GNSS baselines") {
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#ls-observation-table tbody tr').length",
        ),
        18,
      );
      const before = await estimates();
      await click("ls-correlated");
      assert(
        (await estimates()).some((v, i) => Math.abs(v - before[i]) > 0.0001),
      );
      await set("ls-datum", "free");
      assert.match(
        await evaluate("document.getElementById('ls-rank-error').textContent"),
        /Rank 9 < 12/,
      );
      await set("ls-datum", "fixed");
      await set("ls-correlation", -0.8);
    }
    if (label === "GNSS code positioning") {
      assert.match(
        await evaluate("document.getElementById('ls-iteration').textContent"),
        /Iteration 1 \/ 3/,
      );
      assert.match(
        await evaluate("document.getElementById('ls-global-test').textContent"),
        /before the nonlinear iteration has converged/,
      );
      await click("ls-next-iteration");
      assert.match(
        await evaluate("document.getElementById('ls-iteration').textContent"),
        /Iteration 2/,
      );
      await click("ls-converge");
      assert.match(
        await evaluate("document.getElementById('ls-iteration').textContent"),
        /converged/,
      );
      assert.match(
        await evaluate("document.getElementById('ls-global-test').textContent"),
        /inside interval/,
      );
      await evaluate(
        "document.querySelector('.ls-gnss-solution').scrollIntoView({block:'center'})",
      );
      await screenshot("/tmp/least-squares-gnss-result.png");
      await set("ls-geometry", "cluster");
      await click("ls-converge");
      assert.match(
        await evaluate(
          "document.querySelector('.ls-gnss-solution').textContent",
        ),
        /Converged receiver result/,
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#ls-residual-table tbody tr').length",
        ),
        8,
      );
      for (const id of ["S4", "S5", "S6", "S7", "S8"])
        await click("ls-use-" + id);
      assert.match(
        await evaluate("document.getElementById('ls-rank-error').textContent"),
        /Rank 3 < 4/,
      );
      assert.equal(
        await evaluate("document.getElementById('ls-export').disabled"),
        true,
      );
    }
    console.log(
      `${label}: model-driven controls, failure states and six responsive layouts passed.`,
    );
  }
  await resize(390);
  await page.send("Page.navigate", { url: `${base}?simulation=least-squares` });
  await page.until("!!document.getElementById('ls-solution')");
  assert.equal(
    await evaluate("document.querySelector('.ls-controls details').open"),
    false,
    "mobile controls start compact but are reachable above the worksheet",
  );
  await evaluate(
    "document.querySelector('.ls-geometry-panel').scrollIntoView({block:'center'})",
  );
  await screenshot("/tmp/least-squares-mobile.png");
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  console.log(
    "Least-squares browser checks passed: numeric substitutions, normal equations, datum defects, correlation, iterative GNSS, CSV and no runtime exceptions.",
  );
} catch (error) {
  console.error("Runtime errors:", JSON.stringify(page.errors));
  console.error(await evaluate("document.body.textContent.slice(-2500)"));
  throw error;
} finally {
  await page.close();
}
