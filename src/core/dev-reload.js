export function createReloadCoordinator({ watch }) {
  if (typeof watch !== "function") {
    throw new TypeError("Reload coordinator needs a watch function.");
  }

  const clients = new Set();
  const watcher = watch(() => {
    for (const client of clients) {
      client.write("event: reload\ndata: source-changed\n\n");
    }
  });

  function addClient(client) {
    if (!client || typeof client.write !== "function") {
      throw new TypeError("Reload client must expose write().");
    }
    clients.add(client);
    client.on?.("close", () => clients.delete(client));
    return () => clients.delete(client);
  }

  function close() {
    clients.clear();
    watcher?.close?.();
  }

  return Object.freeze({ addClient, close });
}

export function injectReloadClient(html) {
  const script = `
    <script>
      (() => {
        let pendingReload = false;
        const reloadWhenSafe = () => {
          if (location.hash === "#editor") {
            pendingReload = true;
            return;
          }
          location.reload();
        };
        const events = new EventSource("/__dev_events");
        events.addEventListener("reload", reloadWhenSafe);
        window.addEventListener("hashchange", () => {
          if (pendingReload && location.hash !== "#editor") {
            location.reload();
          }
        });
      })();
    </script>
  `;
  return html.includes("</body>")
    ? html.replace("</body>", `${script}</body>`)
    : `${html}${script}`;
}
