import { searchYoutubeRequest } from "../../src/searchResolver.js";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=900"
    }
  });
}

export default async (req: Request) => {
  try {
    let query = "";
    let maxResults = 30;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      query = String(body.query || body.q || "");

      if (Number.isFinite(Number(body.limit))) {
        maxResults = Number(body.limit);
      }
    } else {
      const url = new URL(req.url);
      query = url.searchParams.get("q") || "";

      if (url.searchParams.get("limit")) {
        maxResults = Number(url.searchParams.get("limit")) || 30;
      }
    }

    if (!query.trim()) {
      return json({ ok: false, error: "Enter something to search for." }, 400);
    }

    const result = await searchYoutubeRequest({ query, maxResults });
    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to search YouTube."
      },
      422
    );
  }
};

export const config = {
  path: "/api/search-youtube",
  method: ["GET", "POST"]
};
