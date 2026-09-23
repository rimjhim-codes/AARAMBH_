import { YoutubeTranscript } from "youtube-transcript";

export type YoutubeCaptionChunk = {
  text: string;
  startSec: number;
  endSec: number;
};

/** Resolve an 11-character video id from common YouTube URL shapes. */
export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m?.[1]) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

export async function fetchYoutubeOEmbed(videoId: string): Promise<{
  title: string;
  thumbnailUrl: string;
  channelTitle?: string;
}> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
  );
  if (!res.ok) throw new Error("oembed_failed");
  const data = (await res.json()) as {
    title: string;
    author_name?: string;
    thumbnail_url: string;
  };
  return {
    title: data.title,
    channelTitle: data.author_name,
    thumbnailUrl: data.thumbnail_url
  };
}

/** Merge fine caption lines into embedding-sized chunks while preserving real timestamps. */
export function mergeYoutubeCaptionChunks(
  raw: Array<{ text: string; duration: number; offset: number }>,
  opts?: { maxChars?: number; maxSpanSec?: number }
): YoutubeCaptionChunk[] {
  const maxChars = opts?.maxChars ?? 900;
  const maxSpanSec = opts?.maxSpanSec ?? 48;

  const out: YoutubeCaptionChunk[] = [];
  let buf: string[] = [];
  let startSec = 0;
  let endSec = 0;

  const flush = () => {
    if (!buf.length) return;
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ text, startSec, endSec });
    buf = [];
  };

  for (const item of raw) {
    const segStart = item.offset;
    const segEnd = item.offset + item.duration;
    const piece = item.text.trim();
    if (!piece) continue;

    if (!buf.length) {
      startSec = segStart;
      endSec = segEnd;
      buf.push(piece);
      continue;
    }

    const mergedText = [...buf, piece].join(" ");
    const spanOk = segEnd - startSec <= maxSpanSec;
    const lenOk = mergedText.length <= maxChars;

    if (!lenOk || !spanOk) {
      flush();
      buf.push(piece);
      startSec = segStart;
      endSec = segEnd;
    } else {
      buf.push(piece);
      endSec = segEnd;
    }
  }
  flush();
  return out;
}

export async function fetchYoutubeTranscriptPlan(videoId: string): Promise<{
  chunks: YoutubeCaptionChunk[];
  fullText: string;
  durationSec: number;
}> {
  const raw = await YoutubeTranscript.fetchTranscript(videoId);
  if (!raw?.length) {
    throw new Error("empty_transcript");
  }
  const chunks = mergeYoutubeCaptionChunks(raw);
  const fullText = chunks.map((c) => c.text).join("\n\n");
  const durationSec = Math.ceil(Math.max(...chunks.map((c) => c.endSec), 0));
  return { chunks, fullText, durationSec };
}
