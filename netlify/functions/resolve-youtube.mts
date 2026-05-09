import { resolveYoutubeRequest } from "../../src/playlistResolver.js";

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
    let url = "";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      url = String(body.url || "");
    } else {
      url = new URL(req.url).searchParams.get("url") || "";
    }

    if (!url) {
      return json({ ok: false, error: "Missing YouTube URL." }, 400);
    }

    const result = await resolveYoutubeRequest({ url });
    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to resolve this YouTube URL."
      },
      422
    );
  }
};

export const config = {
  path: "/api/resolve-youtube",
  method: ["GET", "POST"]
};
