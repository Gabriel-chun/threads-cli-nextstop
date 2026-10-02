export const REVIEW_CATEGORIES = [
  "票務／入場摩擦",
  "VIP／互動福利",
  "住宿／落腳",
  "交通／散場",
  "周邊／現場商品",
  "陪同／Solo Attendance",
  "拍攝／現場規則",
  "散場後消費",
  "場館／現場體驗",
  "演後社群／內容需求",
  "其他演出內容"
] as const;

export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export function isReviewCategory(value: string): value is ReviewCategory {
  return REVIEW_CATEGORIES.includes(value as ReviewCategory);
}
