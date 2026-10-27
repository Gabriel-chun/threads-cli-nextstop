/**
 * V0.1 commerce bridge: a reviewed, opt-in layer.
 * It does not collect Threads posts, manufacture KKday products, or publish links.
 */
export type IntentKey = "last_mile" | "intercity" | "overnight";

export type AffiliateProduct = {
  id: string;
  merchant: string;
  title: string;
  intentKeys: IntentKey[];
  status: "candidate" | "verified" | "unavailable";
  affiliateUrl?: string;
  verifiedAt?: string;
  sourceUrl?: string;
};

export type IntentScenario = {
  id: IntentKey;
  eyebrow: string;
  title: string;
  question: string;
  solution: string;
};

export const INTENT_SCENARIOS: IntentScenario[] = [
  {
    id: "last_mile",
    eyebrow: "01 / 散場交通",
    title: "演唱會結束後，怎麼回去？",
    question: "末班車、接駁或計程車，要怎麼比較才不會臨時慌張？",
    solution: "先確認場館、結束時間與官方交通公告，再比較符合行程的合法交通選擇。"
  },
  {
    id: "intercity",
    eyebrow: "02 / 跨城市移動",
    title: "跨縣市看演唱會，怎麼安排往返？",
    question: "當天往返與提早出發，哪種行程更適合？",
    solution: "把演出時間、車次與實際轉乘時間放在一起檢查。"
  },
  {
    id: "overnight",
    eyebrow: "03 / 多留一晚",
    title: "散場後要不要住一晚？",
    question: "如果當天不方便返回，住宿要看哪些條件？",
    solution: "先確認活動日期、交通可達性、取消規則與價格，再決定是否預訂。"
  }
];

/**
 * Review before use:
 * - Each URL must come from an approved merchant/affiliate console.
 * - approvedHosts must be configured from actually verified redirect hosts.
 * - Dates are metadata; this code cannot check real-time inventory or validity.
 * - No automatic ingestion from scraped/social posts is permitted here.
 */
export const AFFILIATE_CATALOG: AffiliateProduct[] = [];

export function verifiedOffers(
  catalog: AffiliateProduct[],
  intent: IntentKey,
  approvedHosts: readonly string[]
): AffiliateProduct[] {
  return catalog.filter((product) => {
    if (product.status !== "verified" || !product.intentKeys.includes(intent)) return false;
    if (!product.affiliateUrl || !product.verifiedAt) return false;
    if (!Number.isFinite(Date.parse(product.verifiedAt))) return false;
    try {
      const url = new URL(product.affiliateUrl);
      if (url.protocol !== "https:" || url.username || url.password) return false;
      const host = url.hostname.toLowerCase();
      return approvedHosts.some((allowed) => {
        const clean = allowed.toLowerCase().trim();
        return clean.length > 0 && (host === clean || host.endsWith("." + clean));
      });
    } catch {
      return false;
    }
  });
}
