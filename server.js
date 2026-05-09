import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveYoutubeRequest } from "./src/playlistResolver.js";
import { searchYoutubeRequest } from "./src/searchResolver.js";
import { buildStarterPack } from "./src/starterMixes.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function handleApi(request, response) {
  try {
    const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    let url = requestUrl.searchParams.get("url") || "";

    if (request.method === "POST") {
      const body = await readBody(request);
      const data = JSON.parse(body || "{}");
      url = String(data.url || "");
    }

    if (!url) {
      sendJson(response, { ok: false, error: "Missing YouTube URL." }, 400);
      return;
    }

    const result = await resolveYoutubeRequest({ url });
    sendJson(response, { ok: true, ...result });
  } catch (error) {
    sendJson(
      response,
      { ok: false, error: error instanceof Error ? error.message : "Unable to resolve YouTube URL." },
      422
    );
  }
}

async function handleSearch(request, response) {
  try {
    const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    let query = requestUrl.searchParams.get("q") || "";
    let maxResults = Number(requestUrl.searchParams.get("limit")) || 30;

    if (request.method === "POST") {
      const body = await readBody(request);
      const data = JSON.parse(body || "{}");
      query = String(data.query || data.q || "");

      if (Number.isFinite(Number(data.limit))) {
        maxResults = Number(data.limit);
      }
    }

    if (!query.trim()) {
      sendJson(response, { ok: false, error: "Enter something to search for." }, 400);
      return;
    }

    const result = await searchYoutubeRequest({ query, maxResults });
    sendJson(response, { ok: true, ...result });
  } catch (error) {
    sendJson(
      response,
      { ok: false, error: error instanceof Error ? error.message : "Unable to search YouTube." },
      422
    );
  }
}

async function handleStarterPack(_request, response) {
  try {
    const result = await buildStarterPack();
    sendJson(response, { ok: true, ...result });
  } catch (error) {
    sendJson(
      response,
      { ok: false, error: error instanceof Error ? error.message : "Unable to build starter pack." },
      422
    );
  }
}

function getFilePath(urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const resolved = normalize(join(root, cleanPath));

  if (!resolved.startsWith(root)) {
    return null;
  }

  if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
    return null;
  }

  return resolved;
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);

  if (requestUrl.pathname === "/api/resolve-youtube") {
    await handleApi(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/search-youtube") {
    await handleSearch(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/starter-pack") {
    await handleStarterPack(request, response);
    return;
  }

  const filePath = getFilePath(requestUrl.pathname);

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
  });

  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`YouTube Mix Player running at http://127.0.0.1:${port}`);
});
