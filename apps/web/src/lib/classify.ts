import type {
  PlaceResult,
  RankRequest,
  RankResponse,
  RankedResult,
  ResultKind,
  SearchResult,
} from "@rodsandreefs/shared";
import chainNames from "@/data/chains.json";

// How "local" is decided, with no paid API:
// 1. Businesses in Google's Places pack are physically near the user (Google did
//    the geo work). We only have to tell chains from independents, using ~5,500
//    US brand names from OpenStreetMap's Name Suggestion Index (data/chains.json).
// 2. An organic link is local only with positive evidence: it matches an
//    independent place from the pack, or it names the user's city and isn't a
//    chain, directory or online-only store. No evidence means "unknown" and the
//    result is left alone, so online retailers are never boosted by default.

/** Keep in sync with normalize() in scripts/build-chains.mjs. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&|\+/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SUFFIXES = new Set([
  "co", "company", "inc", "llc", "corp", "store", "stores", "shop", "shops", "supercenter",
]);

/** Drops a leading "the" and trailing corporate words, keeping at least two words. */
function core(normalized: string): string {
  const words = normalized.split(" ");
  if (words[0] === "the" && words.length > 1) words.shift();
  while (words.length > 2 && SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.join(" ");
}

const squash = (s: string) => s.replace(/ /g, "");

const CHAINS = new Set<string>(chainNames);
const CHAIN_CORES = new Set<string>();
const CHAIN_SQUASHED = new Set<string>();
for (const name of chainNames) {
  const c = core(name);
  CHAIN_CORES.add(c);
  CHAIN_SQUASHED.add(squash(name));
  CHAIN_SQUASHED.add(squash(c));
}

// Single-word giants that show up with extra words ("Target Optical",
// "Walmart Fishing Dept"). Kept short on purpose: matching any one-word brand
// as a prefix would wrongly flag independents like "Liberty Tackle".
const GIANTS = new Set([
  "walmart", "target", "costco", "kroger", "publix", "safeway", "aldi", "lowes",
  "walgreens", "cvs", "starbucks", "mcdonalds", "petco", "petsmart", "autozone",
  "cabelas", "ikea", "kohls", "macys", "menards", "meijer", "wendys", "dominos",
]);

/** True when a business name belongs to a known multi-location brand. */
export function isChainName(name: string): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  const c = core(n);
  if (CHAINS.has(n) || CHAINS.has(`the ${n}`) || CHAIN_CORES.has(c)) return true;

  const words = c.split(" ");
  if (GIANTS.has(words[0]!)) return true;
  // "Bass Pro Shops Outdoor World" -> "bass pro". Multi-word prefixes only.
  for (let len = words.length - 1; len >= 2; len--) {
    const prefix = words.slice(0, len).join(" ");
    if (prefix.length >= 8 && (CHAINS.has(prefix) || CHAIN_CORES.has(prefix))) return true;
  }
  return false;
}

// Domains can't be derived from brand names reliably ("academy.com"), so the
// biggest ones are listed. Everything else falls back to the name data above.
const CHAIN_DOMAINS = [
  "academy.com", "basspro.com", "cabelas.com", "dickssportinggoods.com", "walmart.com",
  "target.com", "homedepot.com", "lowes.com", "costco.com", "samsclub.com", "bestbuy.com",
  "kroger.com", "publix.com", "walgreens.com", "cvs.com", "tractorsupply.com",
  "acehardware.com", "truevalue.com", "harborfreight.com", "menards.com", "rei.com",
  "sportsmans.com", "scheels.com", "westmarine.com", "petsmart.com", "petco.com",
  "autozone.com", "oreillyauto.com", "advanceautoparts.com", "napaonline.com",
  "michaels.com", "hobbylobby.com", "joann.com", "barnesandnoble.com", "booksamillion.com",
  "guitarcenter.com", "staples.com", "officedepot.com", "kohls.com", "macys.com",
  "nordstrom.com", "tjmaxx.com", "ulta.com", "sephora.com", "gamestop.com", "ikea.com",
  "starbucks.com", "dunkindonuts.com", "mcdonalds.com", "dominos.com", "pizzahut.com",
  "papajohns.com", "subway.com", "chipotle.com", "chick-fil-a.com", "wholefoodsmarket.com",
  "traderjoes.com", "aldi.us", "dollargeneral.com", "dollartree.com", "familydollar.com",
  "biglots.com", "ruralking.com", "fleetfarm.com", "orvis.com", "llbean.com",
];

const DIRECTORY_DOMAINS = [
  "yelp.com", "tripadvisor.com", "yellowpages.com", "mapquest.com", "foursquare.com",
  "bbb.org", "angi.com", "thumbtack.com", "nextdoor.com", "manta.com", "superpages.com",
  "chamberofcommerce.com", "opentable.com", "doordash.com", "ubereats.com", "grubhub.com",
  "reddit.com", "quora.com", "wikipedia.org", "youtube.com", "tiktok.com", "pinterest.com",
  "facebook.com", "instagram.com", "x.com", "twitter.com", "linkedin.com", "medium.com",
  "fishbrain.com", "fishingbooker.com", "expertise.com", "birdeye.com", "cylex.us.com",
  "loc8nearme.com", "apple.com", "google.com", "indeed.com", "glassdoor.com",
];

const ONLINE_DOMAINS = [
  "amazon.com", "ebay.com", "etsy.com", "temu.com", "aliexpress.com", "wayfair.com",
  "overstock.com", "chewy.com", "shein.com", "wish.com", "walmart.ca", "tacklewarehouse.com",
  "tackledirect.com", "fishusa.com", "karlsbaittackle.com", "omniafishing.com",
  "sportsmansguide.com", "zappos.com", "newegg.com", "backcountry.com", "moosejaw.com",
];

/** A shop's own page on these sites still counts as the shop. */
const SOCIAL_DOMAINS = ["facebook.com", "instagram.com"];

const onList = (domain: string, list: string[]) =>
  list.some((d) => domain === d || domain.endsWith(`.${d}`));

/** "shop.basspro.com" -> "basspro". */
function domainLabel(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  return parts.length >= 2 ? parts[parts.length - 2]! : domain.toLowerCase();
}

function domainKind(domain: string): ResultKind | undefined {
  const d = domain.toLowerCase();
  if (onList(d, ONLINE_DOMAINS)) return "online";
  if (onList(d, CHAIN_DOMAINS)) return "chain";
  if (onList(d, DIRECTORY_DOMAINS) || /\.(gov|edu|mil)$/.test(d)) return "directory";
  const label = domainLabel(d).replace(/[^a-z0-9]/g, "");
  if (label.length >= 5 && CHAIN_SQUASHED.has(label)) return "chain";
  return undefined;
}

/** "Fishing Gear - Walmart.com" -> true (any title segment is a chain name). */
function titleNamesChain(title: string): boolean {
  return title
    .split(/\s+[-–—|·]\s+|:\s+/)
    .map((seg) => seg.replace(/\.(com|net|org|us)\b/i, ""))
    .some((seg) => isChainName(seg));
}

const LISTICLE = /^(the\s+)?(top|best)\b|\b(top|best)\s+\d+\b|\bnear me\b/i;

const NAME_STOPWORDS = new Set(["the", "of", "llc", "inc", "co", "company", "shop", "store"]);

/** Does this organic result belong to this place? */
function matchesPlace(result: SearchResult, place: PlaceResult, socialOnly: boolean): boolean {
  const name = normalizeName(place.name);
  if (name.length < 5) return false;
  if (normalizeName(result.title).startsWith(name)) return true;
  if (socialOnly) return false;

  if (place.website) {
    try {
      const host = new URL(place.website).hostname.replace(/^www\./, "").toLowerCase();
      if (host === result.domain.toLowerCase()) return true;
    } catch {
      // Not a URL; fall through to name matching.
    }
  }
  const label = domainLabel(result.domain).replace(/[^a-z0-9]/g, "");
  const words = name.split(" ").filter((w) => !NAME_STOPWORDS.has(w));
  // "Woods & Water" should match both woodsandwater.com and woodswater.com.
  const keys = [words.join(""), words.filter((w) => w !== "and").join("")];
  return keys.some(
    (key) =>
      key.length >= 6 && label.length >= 6 && (label.includes(key) || key.startsWith(label)),
  );
}

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const CITY_STATE = new RegExp(
  `([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,2}),\\s*(${US_STATES})\\b`,
  "g",
);

interface City {
  /** Normalized, e.g. "tuscaloosa". */
  key: string;
  /** For display, e.g. "Tuscaloosa, AL". */
  label: string;
}

/** Works out the user's city from explicit location, place addresses, or the query. */
function inferCity(req: RankRequest): City | undefined {
  const counts = new Map<string, { n: number; label: string }>();
  const scan = (text: string, weight: number) => {
    for (const m of text.matchAll(CITY_STATE)) {
      const key = normalizeName(m[1]!);
      const entry = counts.get(key) ?? { n: 0, label: `${m[1]}, ${m[2]}` };
      entry.n += weight;
      counts.set(key, entry);
    }
  };
  for (const place of req.places ?? []) scan(place.details ?? "", 1);

  if (req.location && "text" in req.location) {
    const text = req.location.text.trim();
    scan(text, 5);
    if (counts.size === 0 && text) {
      const city = text.split(",")[0]!.trim();
      if (city) return { key: normalizeName(city), label: text };
    }
  }
  if (counts.size > 0) {
    const [key, best] = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0]!;
    return { key, label: best.label };
  }

  const inQuery = req.query.match(/\b(?:in|near|around)\s+([a-z][a-z .'-]+?)(?:,?\s+[a-z]{2})?$/i);
  const city = inQuery?.[1]?.trim();
  if (city && !/^(me|my area|town|the area)$/i.test(city)) {
    const label = city.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
    return { key: normalizeName(city), label };
  }
  return undefined;
}

function mentionsCity(result: SearchResult, city: City): boolean {
  if (city.key.length < 3) return false;
  const text = ` ${normalizeName(`${result.title} ${result.snippet ?? ""}`)} `;
  if (text.includes(` ${city.key} `)) return true;
  const key = squash(city.key);
  return key.length >= 5 && result.domain.toLowerCase().replace(/[^a-z0-9]/g, "").includes(key);
}

const REASONS: Record<Exclude<ResultKind, "local" | "unknown">, string> = {
  chain: "National chain",
  directory: "Directory",
  online: "Online only",
};

function classifyPlace(place: PlaceResult): RankedResult {
  let chain = isChainName(place.name);
  if (!chain && place.website) {
    try {
      const kind = domainKind(new URL(place.website).hostname.replace(/^www\./, ""));
      chain = kind === "chain" || kind === "online";
    } catch {
      // Ignore a malformed website link.
    }
  }
  if (chain) {
    return {
      id: place.id,
      isLocal: false,
      kind: "chain",
      reason: place.sponsored ? "Sponsored chain" : REASONS.chain,
    };
  }
  return { id: place.id, isLocal: true, kind: "local", reason: "Independent" };
}

export function classify(req: RankRequest): RankResponse {
  const placeList = req.places ?? [];
  const places = placeList.map(classifyPlace);
  const localPlaces = placeList.filter((_, i) => places[i]!.isLocal);
  const chainPlaces = placeList.filter((_, i) => !places[i]!.isLocal);
  const city = inferCity(req);

  const results = req.results.map((r): RankedResult => {
    const local = (reason: string): RankedResult => ({
      id: r.id,
      isLocal: true,
      kind: "local",
      reason,
    });
    const other = (kind: Exclude<ResultKind, "local" | "unknown">): RankedResult => ({
      id: r.id,
      isLocal: false,
      kind,
      reason: REASONS[kind],
    });

    if (onList(r.domain.toLowerCase(), SOCIAL_DOMAINS)) {
      return localPlaces.some((p) => matchesPlace(r, p, true))
        ? local("Independent · shop's own page")
        : other("directory");
    }
    const kind = domainKind(r.domain);
    if (kind === "chain" || kind === "directory" || kind === "online") return other(kind);
    if (titleNamesChain(r.title)) return other("chain");
    if (chainPlaces.some((p) => matchesPlace(r, p, false))) return other("chain");
    if (localPlaces.some((p) => matchesPlace(r, p, false))) {
      return local("Independent · on the map near you");
    }
    if (LISTICLE.test(r.title)) return other("directory");
    if (city && mentionsCity(r, city)) return local(`Independent · ${city.label}`);
    return { id: r.id, isLocal: false, kind: "unknown" };
  });

  return { results, places, location: city?.label };
}
