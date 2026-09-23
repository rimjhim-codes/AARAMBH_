/**
 * Parse video timestamps from natural questions: "12:40", "1:20:05", "90 minutes".
 */
export function parseTimestampSecondsFromQuestion(q: string): number | null {
  const s = q.trim();
  if (!s) return null;

  const hms = s.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (hms) {
    const h = Number(hms[1]);
    const m = Number(hms[2]);
    const sec = Number(hms[3]);
    if (m >= 60 || sec >= 60) return null;
    return h * 3600 + m * 60 + sec;
  }

  const ms = s.match(/\b(\d{1,3}):(\d{2})\b/);
  if (ms) {
    const a = Number(ms[1]);
    const b = Number(ms[2]);
    if (b >= 60) return null;
    return a * 60 + b;
  }

  const minMatch = s.match(/\b(\d+)\s*(?:minutes?|mins?)\b/i);
  if (minMatch) return Number(minMatch[1]) * 60;

  const secMatch = s.match(/\b(\d+)\s*(?:seconds?|secs?)\b/i);
  if (secMatch) return Number(secMatch[1]);

  return null;
}

export function formatTimestampLabel(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
