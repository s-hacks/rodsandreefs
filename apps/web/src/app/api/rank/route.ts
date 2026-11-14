import type { RankRequest, RankResponse } from "@rodsandreefs/shared";

// DEMO: naive heuristic. Anything that isn't a known national chain or
// marketplace counts as "local". Replace with real lookups (Places/Yelp API,
// ownership data, distance from the user) before relying on it.
const NON_LOCAL_DOMAINS = [
  "academy.com",
  "amazon.com",
  "basspro.com",
  "cabelas.com",
  "dickssportinggoods.com",
  "ebay.com",
  "homedepot.com",
  "lowes.com",
  "target.com",
  "walmart.com",
  // Directories and aggregators: not businesses themselves.
  "facebook.com",
  "mapquest.com",
  "reddit.com",
  "tripadvisor.com",
  "wikipedia.org",
  "yellowpages.com",
  "yelp.com",
  "youtube.com",
];

function isNonLocal(domain: string) {
  return NON_LOCAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export async function POST(request: Request) {
  const body = (await request.json()) as RankRequest;

  const response: RankResponse = {
    results: body.results.map((r) =>
      isNonLocal(r.domain)
        ? { id: r.id, isLocal: false }
        : { id: r.id, isLocal: true, reason: "Independent business" },
    ),
  };

  return Response.json(response);
}
