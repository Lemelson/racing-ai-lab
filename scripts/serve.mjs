import { createReadStream, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReloadCoordinator,
  injectReloadClient,
} from "../src/core/dev-reload.js";

const root = normalize(
  process.env.RACING_ROOT ??
    join(fileURLToPath(new URL("..", import.meta.url))),
);
const port = Number(process.env.PORT ?? 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const reloadCoordinator = createReloadCoordinator({
  watch(onChange) {
    let pending = null;
    const watcher = watch(root, { recursive: true }, (_event, filename) => {
      const path = String(filename ?? "");
      if (
        path.startsWith(".git/") ||
        path.includes("/node_modules/") ||
        !/\.(?:css|html|js|json)$/.test(path)
      ) {
        return;
      }
      clearTimeout(pending);
      pending = setTimeout(onChange, 40);
    });
    return {
      close() {
        clearTimeout(pending);
        watcher.close();
      },
    };
  },
});

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/__dev_events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    response.write(": connected\n\n");
    reloadCoordinator.addClient(response);
    return;
  }

  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const path = normalize(join(root, requested));

  if (!path.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (!statSync(path).isFile()) {
      throw new Error("Not a file");
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (requested === "index.html") {
      response.end(injectReloadClient(readFileSync(path, "utf8")));
    } else {
      createReadStream(path).pipe(response);
    }
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Racing AI Lab: http://127.0.0.1:${port}`);
});

function close() {
  reloadCoordinator.close();
  server.close();
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
