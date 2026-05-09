import { highQualityArtistSearchRequest } from "../../src/searchResolver.js";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=1800"
    }
  });
}

export default async (req: Request) => {
  try {
    let artist = "";
    let maxResults = 40;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      artist = String(body.artist || "");
      if (Number.isFinite(Number(body.limit))) maxResults = Number(body.limit);
    } else {
      const url = new URL(req.url);
      artist = url.searchParams.get("artist") || "";
      if (url.searchParams.get("limit")) maxResults = Number(url.searchParams.get("limit")) || 40;
    }

    if (!artist.trim()) {
      return json({ ok: false, error: "Pass an artist name." }, 400);
    }

    const result = await highQualityArtistSearchRequest({ artist, maxResults });
    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to run HQ artist search."
      },
      422
    );
  }
};

export const config = {
  path: "/api/hq-artist",
  method: ["GET", "POST"]
};
