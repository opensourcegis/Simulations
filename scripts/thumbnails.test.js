import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { THUMBNAILS } from "../src/thumbnail-catalog.js";

test("every catalogue card has a described, locally hosted thumbnail", async () => {
  const app = await readFile(
    new URL("../src/App.jsx", import.meta.url),
    "utf8",
  );
  const kinds = [...app.matchAll(/kind: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(kinds.length, 24);
  assert.deepEqual([...new Set(kinds)].sort(), Object.keys(THUMBNAILS).sort());
  for (const kind of kinds) assert(THUMBNAILS[kind].length > 35, kind);
  assert(!app.includes("function Grid("), "flat sketch renderer is retired");
});

test("all previews have unique, compact WebP assets at both responsive sizes", async () => {
  const directory = new URL("../public/thumbnails/", import.meta.url);
  const files = (await readdir(directory)).filter((f) => f.endsWith(".webp"));
  assert.equal(files.length, Object.keys(THUMBNAILS).length * 2);
  for (const width of [480, 960]) {
    const hashes = new Set();
    for (const kind of Object.keys(THUMBNAILS)) {
      const file = new URL(`${kind}-${width}.webp`, directory);
      const bytes = await readFile(file);
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      assert((await stat(file)).size < 80000, `${kind} is too heavy`);
      hashes.add(createHash("sha256").update(bytes).digest("hex"));
    }
    assert.equal(
      hashes.size,
      Object.keys(THUMBNAILS).length,
      "distinct lessons must not share generic artwork",
    );
  }
});
