/** German-friendly duration (aligned with old ranksystem date format). */
export function formatDurationGerman(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "Tag" : "Tage"}`);
  if (hours > 0) parts.push(`${hours} Std.`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} Min.`);
  if (parts.length === 0) parts.push(`${secs} Sek.`);

  return parts.join(", ");
}
