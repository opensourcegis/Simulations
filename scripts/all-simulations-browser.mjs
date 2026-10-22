import assert from "node:assert/strict";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";

const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const page = await openBrowserPage();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await page.send("Page.navigate", { url: base });
  await page.until('document.querySelectorAll("a.card").length > 20');
  const links = await page.evaluate(
    '[...document.querySelectorAll("a.card")].map(a=>({url:a.href,title:a.querySelector("h3").textContent}))',
  );
  const failures = [];
  for (const link of links) {
    const errorStart = page.errors.length;
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send("Page.navigate", { url: link.url });
    await page.until(
      'document.readyState==="complete" && !!document.querySelector("h1")',
    );
    await pause(700);
    assert.equal(
      await page.evaluate(
        'document.body.textContent.includes("The laboratory could not start")',
      ),
      false,
      `${link.title} failed to mount`,
    );
    assert.equal(
      await page.evaluate('getComputedStyle(document.body).backgroundColor'),
      'rgb(245, 246, 247)',
      `${link.title}: shared minimal workspace theme missing`,
    );
    const report = { title: link.title, errors: [], overflow: [] };
    for (const width of [1440, 768, 390, 320]) {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 500,
      });
      await pause(120);
      const layout = await page.evaluate(
        `({overflow:document.documentElement.scrollWidth>innerWidth+1, offenders:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2 && getComputedStyle(e).position!=='absolute').slice(0,8).map(e=>e.tagName+'.'+e.className)})`,
      );
      if (layout.overflow) report.overflow.push({ width, ...layout });
    }
    report.errors = page.errors
      .slice(errorStart)
      .map((e) => e.exception?.description || e.text);
    if (report.errors.length || report.overflow.length) failures.push(report);
    console.log(JSON.stringify(report));
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
  console.log(
    `${links.length} catalogue entries: runtime and responsive smoke checks passed.`,
  );
} finally {
  await page.close();
}
