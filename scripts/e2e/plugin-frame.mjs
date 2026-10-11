// Evaluate JS inside an INSTALLED plugin's iframe over raw CDP.
//
// Installed plugins are cross-origin (lsp://logseq.io) and therefore
// out-of-process iframes; Playwright-over-CDP does not surface them as frames,
// but Chromium lists each as its own "iframe" target with a websocket URL.
// Uses Node's built-in WebSocket (Node >= 22).
//
//   const f = await pluginFrame(9345, "logseq-bermaid")
//   await f.eval("document.title")        // -> value (JSON-serialisable)
//   await f.close()
export async function pluginFrame(port, idSubstring) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const t = targets.find(t => t.type === "iframe" && t.url.includes(idSubstring));
  if (!t) throw new Error(`no iframe target for ${idSubstring}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    url: t.url,
    eval: async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "evaluate failed");
      return r.result?.result?.value;
    },
    close: () => ws.close(),
  };
}
