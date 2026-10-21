import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { openBrowserPage } from "./thumbnail-browser-client.mjs";

const server = await createServer({
  server: { port: 4180, strictPort: true, host: "127.0.0.1" },
});
await server.listen();
let page;
try {
  page = await openBrowserPage();
  await page.send("Page.navigate", {
    url: "http://127.0.0.1:4180/Simulations/scripts/thumbnail-studio.html",
  });
  await page.until("typeof window.renderThumbnail==='function'");
  const kinds = await page.evaluate("window.thumbnailKinds");
  const requested = process.argv.slice(2);
  await mkdir("public/thumbnails", { recursive: true });
  for (const kind of requested.length ? requested : kinds) {
    if (!kinds.includes(kind)) throw new Error(`Unknown thumbnail ${kind}`);
    for (const width of [480, 960]) {
      const url = await page.evaluate(
        `window.renderThumbnail(${JSON.stringify(kind)},${width})`,
      );
      if (!url.startsWith("data:image/webp;base64,"))
        throw new Error(`Invalid WebP for ${kind}`);
      const bytes = Buffer.from(url.split(",")[1], "base64");
      await writeFile(`public/thumbnails/${kind}-${width}.webp`, bytes);
      console.log(
        `${kind}-${width}.webp: ${(bytes.length / 1024).toFixed(1)} KiB`,
      );
    }
  }
  if (page.errors.length) throw new Error(JSON.stringify(page.errors));
} finally {
  await page?.close();
  await server.close();
}
