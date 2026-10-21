import assert from "node:assert/strict";

// Uses an existing headless Chromium, avoiding an extra browser dependency.
export async function openBrowserPage() {
  const endpoint = process.env.PHOTO_CDP_URL || "http://localhost:9222";
  const tab = await (
    await fetch(`${endpoint}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map(),
    errors = [];
  socket.addEventListener("message", (e) => {
    const message = JSON.parse(e.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(message.id);
        entry.resolve(message);
      }
    }
    if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(new Error(`Browser timeout: ${method}`));
      }, 45000);
      pending.set(n, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const reply = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    assert(!reply.error, JSON.stringify(reply.error));
    assert(
      !reply.result.exceptionDetails,
      JSON.stringify(reply.result.exceptionDetails),
    );
    return reply.result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.fail(`Timed out: ${expression}`);
  };
  await send("Runtime.enable");
  await send("Page.enable");
  return {
    send,
    evaluate,
    until,
    errors,
    close: async () => {
      for (const p of pending.values()) clearTimeout(p.timer);
      socket.close();
      await fetch(`${endpoint}/json/close/${tab.id}`);
    },
  };
}
