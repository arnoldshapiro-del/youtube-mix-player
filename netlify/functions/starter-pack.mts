import { buildStarterPack } from "../../src/starterMixes.js";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=900, stale-while-revalidate=3600"
    }
  });
}

export default async () => {
  try {
    const result = await buildStarterPack();
    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to build starter pack."
      },
      422
    );
  }
};

export const config = {
  path: "/api/starter-pack",
  method: ["GET", "POST"]
};
