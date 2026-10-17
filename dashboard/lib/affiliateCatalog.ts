/**
 * KKday product candidates are maintained separately from Review Intelligence.
 * An affiliate URL only counts as connected after a KKpartners-generated URL
 * has been supplied and passed basic domain / product / tracking checks.
 */
export type AffiliateProduct = {
  product_id: string;
  priority: number;
  title_zh: string;
  title_en: string;
  context_zh: string;
  context_en: string;
  cluster_ids: string[];
  public_url: string;
  affiliate_url: string | null;
};

const CATALOG_URL =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/affiliate/kkday_products.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductPage(url: string, id: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      parsed.hostname === "www.kkday.com" &&
      new RegExp("^/[a-z]{2}(?:-[a-z]{2})?/product/" + id + "(?:-|/|$)", "i").test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Fail closed: a non-KKday or missing-tracking URL is not an affiliate link. */
export function isVerifiedAffiliateUrl(url: unknown, id: string): url is string {
  if (typeof url !== "string" || !isProductPage(url, id)) return false;
  try {
    const cid = new URL(url).searchParams.get("cid");
    return Boolean(cid && /^[a-zA-Z0-9_-]{1,80}$/.test(cid));
  } catch {
    return false;
  }
}

export function parseAffiliateCatalog(raw: unknown): AffiliateProduct[] {
  if (!isRecord(raw) || raw.schema_version !== "nextstop-affiliate-catalog-v0.1" || !Array.isArray(raw.products)) return [];
  const seen = new Set<string>();
  const entries: AffiliateProduct[] = [];
  for (const row of raw.products) {
    if (!isRecord(row) || typeof row.product_id !== "string" || !/^\d{2,12}$/.test(row.product_id) || seen.has(row.product_id)) continue;
    const fields = ["title_zh", "title_en", "context_zh", "context_en", "public_url"] as const;
    if (!fields.every(field => typeof row[field] === "string" && (row[field] as string).trim().length > 0)) continue;
    const publicUrl = row.public_url as string;
    if (!isProductPage(publicUrl, row.product_id) || !Array.isArray(row.cluster_ids)) continue;
    const clusters = row.cluster_ids.filter((c): c is string => typeof c === "string" && /^[a-z][a-z0-9_]{2,40}$/.test(c));
    if (!clusters.length) continue;
    seen.add(row.product_id);
    entries.push({
      product_id: row.product_id,
      priority: typeof row.priority === "number" && Number.isFinite(row.priority) ? row.priority : 99,
      title_zh: row.title_zh as string,
      title_en: row.title_en as string,
      context_zh: row.context_zh as string,
      context_en: row.context_en as string,
      cluster_ids: [...new Set(clusters)],
      public_url: publicUrl,
      affiliate_url: isVerifiedAffiliateUrl(row.affiliate_url, row.product_id) ? row.affiliate_url : null
    });
  }
  return entries.sort((a,b) => a.priority - b.priority);
}

export function matchingAffiliateProducts(products: AffiliateProduct[], clusterId: string): AffiliateProduct[] {
  return products.filter(product => product.cluster_ids.includes(clusterId));
}

export async function loadAffiliateProducts(): Promise<AffiliateProduct[]> {
  try {
    const response = await fetch(CATALOG_URL, {
      headers: { "User-Agent": "next-stop-live-affiliate-mapping" },
      cache: "no-store"
    });
    if (!response.ok) return [];
    return parseAffiliateCatalog(await response.json());
  } catch {
    return [];
  }
}
