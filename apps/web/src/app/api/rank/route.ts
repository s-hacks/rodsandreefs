import type { PlaceResult, RankRequest, SearchResult } from "@rodsandreefs/shared";
import { classify } from "@/lib/classify";

const MAX_ITEMS = 60;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Accepts anything, returns a well-formed request (the extension is the only caller). */
function parse(body: unknown): RankRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.results)) return null;

  const results: SearchResult[] = b.results.slice(0, MAX_ITEMS).map((r, i) => ({
    id: str(r?.id, 20) || String(i),
    url: str(r?.url, 2000),
    title: str(r?.title, 300),
    domain: str(r?.domain, 255),
    snippet: str(r?.snippet, 500) || undefined,
  }));
  const places: PlaceResult[] = (Array.isArray(b.places) ? b.places : [])
    .slice(0, MAX_ITEMS)
    .map((p, i) => ({
      id: str(p?.id, 20) || String(i),
      name: str(p?.name, 200),
      sponsored: p?.sponsored === true,
      website: str(p?.website, 2000) || undefined,
      details: str(p?.details, 500) || undefined,
    }));

  const loc = b.location as { text?: unknown } | undefined;
  const text = str(loc?.text, 100);
  return { query: str(b.query, 300), results, places, location: text ? { text } : undefined };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const req = parse(body);
  if (!req) return Response.json({ error: "Expected { query, results[] }" }, { status: 400 });
  return Response.json(classify(req));
}
