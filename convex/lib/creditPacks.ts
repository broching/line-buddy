// Shared credit pack definitions — used by both Convex backend and Next.js frontend.
// NEVER derive credits from price on the frontend; the server validates packId against this table.

export const CREDIT_PACKS = {
  "1000": { credits: 1_000, priceSGD: 9.9, label: "1,000 credits", priceDisplay: "S$9.90" },
  "5000": { credits: 5_000, priceSGD: 39.9, label: "5,000 credits", priceDisplay: "S$39.90" },
  "15000": { credits: 15_000, priceSGD: 99.9, label: "15,000 credits", priceDisplay: "S$99.90" },
  "50000": { credits: 50_000, priceSGD: 299.9, label: "50,000 credits", priceDisplay: "S$299.90" },
} as const;

export type PackId = keyof typeof CREDIT_PACKS;

export const PACK_IDS = Object.keys(CREDIT_PACKS) as PackId[];
