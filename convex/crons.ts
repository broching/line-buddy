import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Prune old WhatsApp inbound-dedup keys daily so the table stays bounded.
crons.interval(
  "cleanup whatsapp inbound keys",
  { hours: 24 },
  internal.whatsappSessions.cleanupInboundKeys,
  {}
);

export default crons;
