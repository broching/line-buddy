// Public deep links / display values for the shared (managed) bots. These are not
// secrets, so they're inlined at build time via NEXT_PUBLIC_* with sensible defaults.

export const MANAGED_WHATSAPP_NUMBER = "+65 8851 9761";

// Link that opens a WhatsApp chat with the managed bot (used for the add-bot QR too).
export const WA_MANAGED_LINK =
  process.env.NEXT_PUBLIC_WA_MANAGED_LINK || "https://wa.me/message/QXRF7D3PDBLHC1";

// Link to add the shared LINE bot as a friend (e.g. https://lin.ee/xxxxx). Empty
// until configured — the LINE add-bot QR only renders when this is set.
export const LINE_ADD_URL = process.env.NEXT_PUBLIC_LINE_ADD_URL || "";
