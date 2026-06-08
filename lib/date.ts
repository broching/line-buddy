export function formatDistanceToNow(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function msToHumanDelay(ms: number): string {
  if (ms === 0) return "No reminder";
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours}h`;
  const days = hours / 24;
  return `${days}d`;
}

export const REMINDER_OPTIONS: { label: string; value: number }[] = [
  { label: "No reminder", value: 0 },
  { label: "2 hours", value: 2 * 60 * 60 * 1000 },
  { label: "6 hours", value: 6 * 60 * 60 * 1000 },
  { label: "12 hours", value: 12 * 60 * 60 * 1000 },
  { label: "24 hours (1 day)", value: 24 * 60 * 60 * 1000 },
  { label: "48 hours (2 days)", value: 48 * 60 * 60 * 1000 },
  { label: "72 hours (3 days)", value: 72 * 60 * 60 * 1000 },
];
