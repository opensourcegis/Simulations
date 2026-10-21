import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { THUMBNAILS } from "../src/thumbnail-catalog.js";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";

const base = process.env.PHOTO_BASE_URL || "http://localhost:4173/Simulations/";
const page = await openBrowserPage();
try {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send("Page.navigate", { url: base });
  await page.until("document.querySelectorAll('.card').length===23");
  await page.evaluate(
    "Promise.all([...document.querySelectorAll('.simulation-thumbnail')].map(image=>{image.loading='eager';return image.decode()}))",
  );
  assert.equal(
    await page.evaluate(
      "document.querySelectorAll('.thumb svg, .thumb canvas').length",
    ),
    0,
  );
  assert.equal(
    await page.evaluate("document.querySelectorAll('canvas').length"),
    0,
    "catalogue must not run live renderers",
  );
  assert(
    await page.evaluate(
      "[...document.querySelectorAll('.simulation-thumbnail')].every(i=>i.alt.length>35&&i.complete&&i.naturalWidth>0&&i.getAttribute('srcset').includes('960w')&&i.getAttribute('width')==='960'&&i.getAttribute('height')==='540')",
    ),
  );
  // Decode every shipped size, including assets not chosen by this display's srcset.
  for (const kind of Object.keys(THUMBNAILS)) {
    for (const width of [480, 960]) {
      const url = `${base}thumbnails/${kind}-${width}.webp`;
      assert.deepEqual(
        await page.evaluate(
          `(async()=>{const i=new Image();i.src=${JSON.stringify(url)};await i.decode();return [i.naturalWidth,i.naturalHeight]})()`,
        ),
        [width, (width * 9) / 16],
      );
    }
  }
  // A review sheet and page screenshot make visual changes inspectable.
  const contact = await page.evaluate(
    `(async()=>{const images=[...document.querySelectorAll('.simulation-thumbnail')];const c=document.createElement('canvas');c.width=1280;c.height=Math.ceil(images.length/4)*204;const x=c.getContext('2d');x.fillStyle='#10232c';x.fillRect(0,0,c.width,c.height);for(let i=0;i<images.length;i++){const left=(i%4)*320,top=Math.floor(i/4)*204;x.drawImage(images[i],left,top,320,180);x.fillStyle='#dbe5de';x.font='12px system-ui';x.fillText(images[i].closest('.card').querySelector('h3').textContent,left+8,top+197)}return c.toDataURL('image/png')})()`,
  );
  await writeFile(
    "/tmp/thumbnail-contact-sheet.png",
    Buffer.from(contact.split(",")[1], "base64"),
  );
  await page.evaluate(
    "document.getElementById('simulators').scrollIntoView({block:'start'})",
  );
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "/tmp/catalogue-thumbnails.png",
    Buffer.from(shot.result.data, "base64"),
  );
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    assert.equal(
      await page.evaluate("document.documentElement.scrollWidth>innerWidth"),
      false,
      `overflow at ${width}`,
    );
    assert(
      await page.evaluate(
        "[...document.querySelectorAll('.thumb')].every(e=>{const r=e.getBoundingClientRect();return Math.abs(r.width/r.height-16/9)<.03})",
      ),
      `aspect ratio at ${width}`,
    );
  }
  await page.evaluate(
    "[...document.querySelectorAll('.filter')].find(b=>b.textContent==='LiDAR').click()",
  );
  await page.until("document.querySelectorAll('.card').length===7");
  await page.evaluate(
    "[...document.querySelectorAll('.filter')].find(b=>b.textContent==='All').click()",
  );
  await page.until("document.querySelectorAll('.card').length===23");
  await page.evaluate(
    "(()=>{const e=document.querySelector('input[aria-label=\"Search simulators\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'camera works');e.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await page.until("document.querySelectorAll('.card').length===1");
  assert.match(
    await page.evaluate("document.querySelector('.simulation-thumbnail').src"),
    /camera-\d+.webp$/,
  );
  await page.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  assert.equal(
    await page.evaluate(
      "getComputedStyle(document.querySelector('.simulation-thumbnail')).transitionDuration",
    ),
    "0s",
  );
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  console.log(
    "Catalogue: all 23 cards, 44 decoded WebP sizes, six layouts, filtering/search, reduced motion and no runtime errors passed.",
  );
} finally {
  await page.close();
}
