"use client";

import ReactPlayer from "react-player/lazy";
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { translateTranscript } from "../../lib/api";

function isYoutubeUrl(url: string) {
  return /youtube\.com|youtu\.be/i.test(url);
}

type TranscriptChunk = {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
};

function formatTs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);

  return `${m}:${String(s).padStart(2, "0")}`;
}

type SubtitleSettings = {
  enabled: boolean;
  language: "english" | "hindi";
  position: "overlay" | "below";
};

export function SmartPlayer({
  videoUrl,
  transcript,
  timeline,
  chatSlot,
  notebookLayout = false,
  startPositionSec,
  onPlaybackStatus
}: {
  videoUrl: string;
  transcript: TranscriptChunk[];
  timeline: Array<{
    id: string;
    timestamp: number;
    label: string;
    importance: number;
  }>;
  chatSlot?: ReactNode;
  notebookLayout?: boolean;
  startPositionSec?: number;
  onPlaybackStatus?: (positionSec: number, durationSec: number) => void;
}) {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const playerRef =
    useRef<ReactPlayer | null>(null);

  const transcriptLineRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({});

  const [currentTime, setCurrentTime] =
    useState(0);

  const [isTranscriptOpen, setIsTranscriptOpen] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState("");

  const [subtitleSettings, setSubtitleSettings] =
    useState<SubtitleSettings>({
      enabled: true,
      language: "english",
      position: "overlay"
    });

  const [
    translatedTranscriptCache,
    setTranslatedTranscriptCache
  ] = useState<{
    english: TranscriptChunk[];
    hindi: TranscriptChunk[];
  }>(() => ({
    english: transcript,
    hindi: []
  }));

  const [
    isTranslatingTranscript,
    setIsTranslatingTranscript
  ] = useState(false);

  const [translationError, setTranslationError] =
    useState<string | null>(null);

  const topTimeline = useMemo(
    () => timeline.slice(0, 8),
    [timeline]
  );

  const getTranscriptForLanguage = (
    lang: SubtitleSettings["language"]
  ) => {
    if (lang === "english") {
      return translatedTranscriptCache.english;
    }

    return translatedTranscriptCache.hindi.length
      ? translatedTranscriptCache.hindi
      : transcript;
  };

  const currentTranscript = useMemo(
    () =>
      getTranscriptForLanguage(
        subtitleSettings.language
      ),
    [
      subtitleSettings.language,
      translatedTranscriptCache,
      transcript
    ]
  );

  useEffect(() => {
    setTranslatedTranscriptCache({
      english: transcript,
      hindi: []
    });
  }, [transcript]);

  const translateCurrentTranscript =
    useCallback(async () => {
      if (
        subtitleSettings.language !==
          "hindi" ||
        isTranslatingTranscript ||
        translatedTranscriptCache.hindi.length
      ) {
        return;
      }

      setIsTranslatingTranscript(true);

      setTranslationError(null);

      try {
        const translatedChunks =
          await translateTranscript(
            transcript,
            "Hindi"
          );

        setTranslatedTranscriptCache(
          (prev) => ({
            ...prev,
            hindi: translatedChunks
          })
        );
      } catch (error) {
        console.error(error);

        setTranslationError(
          "Unable to translate transcript. Please try again later."
        );
      } finally {
        setIsTranslatingTranscript(false);
      }
    }, [
      subtitleSettings.language,
      isTranslatingTranscript,
      translatedTranscriptCache.hindi.length,
      transcript
    ]);

  useEffect(() => {
    translateCurrentTranscript();
  }, [translateCurrentTranscript]);

  const filteredTranscript = useMemo(() => {
    if (!searchQuery.trim()) {
      return currentTranscript;
    }

    return currentTranscript.filter((chunk) =>
      chunk.text
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    );
  }, [currentTranscript, searchQuery]);

  function getCurrentTime() {
    if (isYoutubeUrl(videoUrl)) {
      const playerInstance =
        playerRef.current as unknown as {
          getCurrentTime?: () => number;
        };

      return (
        playerInstance?.getCurrentTime?.() ?? 0
      );
    }

    return videoRef.current?.currentTime ?? 0;
  }

  function getDuration() {
    if (isYoutubeUrl(videoUrl)) {
      const playerInstance =
        playerRef.current as unknown as {
          getDuration?: () => number;
        };

      return playerInstance?.getDuration?.() ?? 0;
    }

    return videoRef.current?.duration ?? 0;
  }

  function jumpTo(sec: number) {
    if (isYoutubeUrl(videoUrl)) {
      playerRef.current?.seekTo(
        sec,
        "seconds"
      );

      return;
    }

    if (!videoRef.current) return;

    videoRef.current.currentTime = sec;

    videoRef.current.play().catch(() => {});
  }

  const activeChunk = useMemo(() => {
    if (
      !currentTranscript.length ||
      !subtitleSettings.enabled
    ) {
      return null;
    }

    const active = currentTranscript.find(
      (chunk) =>
        currentTime >= chunk.startSec &&
        currentTime < chunk.endSec
    );

    return active ?? null;
  }, [
    currentTime,
    currentTranscript,
    subtitleSettings.enabled
  ]);

  const hasSeekedInit = useRef(false);
  useEffect(() => {
    hasSeekedInit.current = false;
  }, [videoUrl]);

  useEffect(() => {
    if (!currentTranscript.length) {
      setCurrentTime(0);

      return;
    }

    const interval = window.setInterval(() => {
      const pos = getCurrentTime();
      const dur = getDuration();
      setCurrentTime(pos);
      
      if (onPlaybackStatus) {
        onPlaybackStatus(pos, dur);
      }

      if (!hasSeekedInit.current && dur > 0 && startPositionSec && startPositionSec > 0) {
        hasSeekedInit.current = true;
        jumpTo(Math.min(startPositionSec, dur));
      }
    }, 200);

    return () => {
      window.clearInterval(interval);
    };
  }, [videoUrl, currentTranscript.length, onPlaybackStatus, startPositionSec]);

  useEffect(() => {
    if (!activeChunk?.id) return;

    const activeElement =
      transcriptLineRefs.current[
        activeChunk.id
      ];

    activeElement?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }, [activeChunk?.id]);

  const hasTranscript = transcript.length > 0;

  const subtitleOverlay =
    subtitleSettings.enabled &&
    activeChunk && (
      <div className="absolute bottom-4 left-1/2 w-full max-w-2xl -translate-x-1/2 px-4">
        <div className="mx-auto max-w-3xl rounded-xl bg-black/70 px-5 py-3 text-center backdrop-blur-md">
          <p className="text-sm font-medium leading-6 text-white md:text-base">
            {activeChunk.text}
          </p>
        </div>
      </div>
    );

  const subtitleBelow =
    subtitleSettings.enabled &&
    activeChunk &&
    subtitleSettings.position ===
      "below" && (
      <div className="mt-4">
        <div className="mx-auto max-w-3xl rounded-xl bg-black/70 px-5 py-3 text-center backdrop-blur-md">
          <p className="text-sm font-medium leading-6 text-white md:text-base">
            {activeChunk.text}
          </p>
        </div>
      </div>
    );

  const subtitleControls = hasTranscript && (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={subtitleSettings.enabled}
          onChange={(e) =>
            setSubtitleSettings((prev) => ({
              ...prev,
              enabled: e.target.checked
            }))
          }
          className="rounded border-white/20 bg-white/10"
        />

        <span className="text-zinc-300">
          Subtitles
        </span>
      </label>

      {subtitleSettings.enabled && (
        <>
          <select
            value={subtitleSettings.language}
            onChange={(e) =>
              setSubtitleSettings((prev) => ({
                ...prev,
                language:
                  e.target
                    .value as SubtitleSettings["language"]
              }))
            }
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-200"
          >
            <option value="english">
              English
            </option>

            <option value="hindi">
              Hindi
            </option>
          </select>

          <select
            value={subtitleSettings.position}
            onChange={(e) =>
              setSubtitleSettings((prev) => ({
                ...prev,
                position:
                  e.target.value as SubtitleSettings["position"]
              }))
            }
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-200"
          >
            <option value="overlay">
              Overlay
            </option>

            <option value="below">
              Below
            </option>
          </select>
        </>
      )}
    </div>
  );

  const transcriptPanel = hasTranscript && (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">
            Transcript
          </p>

          <p className="text-xs text-zinc-500">
            YouTube-style transcript
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setIsTranscriptOpen((open) => !open)
          }
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
        >
          {isTranscriptOpen
            ? "Close"
            : "Open"}
        </button>
      </div>

      {isTranscriptOpen && (
        <div className="space-y-3 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) =>
                setSearchQuery(e.target.value)
              }
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
            />

            <select
              value={subtitleSettings.language}
              onChange={(e) =>
                setSubtitleSettings(
                  (prev) => ({
                    ...prev,
                    language:
                      e.target
                        .value as SubtitleSettings["language"]
                  })
                )
              }
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              <option value="english">
                English
              </option>

              <option value="hindi">
                Hindi
              </option>
            </select>
          </div>

          {(isTranslatingTranscript ||
            translationError) && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
              {isTranslatingTranscript ? (
                <span>
                  Translating transcript into
                  Hindi…
                </span>
              ) : (
                <span className="text-rose-400">
                  {translationError}
                </span>
              )}
            </div>
          )}

          <div className="max-h-[420px] overflow-y-auto rounded-xl bg-zinc-950">
            {!filteredTranscript.length ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">
                No transcript found.
              </div>
            ) : (
              <div className="space-y-1 px-2 py-2">
                {filteredTranscript.map(
                  (chunk) => {
                    const isActive =
                      chunk.id ===
                      activeChunk?.id;

                    return (
                      <button
                        key={chunk.id}
                        type="button"
                        ref={(element) => {
                          transcriptLineRefs.current[
                            chunk.id
                          ] = element;
                        }}
                        onClick={() =>
                          jumpTo(
                            chunk.startSec
                          )
                        }
                        className={`flex w-full items-start gap-2 rounded-md px-2 py-1 text-left transition-all duration-200 ${
                          isActive
                            ? "bg-cyan-500/10 text-white"
                            : "text-zinc-300 hover:bg-zinc-900"
                        }`}
                      >
                        <span
                          className={`min-w-[52px] text-[11px] font-mono ${
                            isActive
                              ? "text-cyan-300"
                              : "text-zinc-500"
                          }`}
                        >
                          {formatTs(
                            chunk.startSec
                          )}
                        </span>

                        <span className="flex-1 text-[13px] leading-5">
                          {chunk.text}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (notebookLayout && chatSlot) {
    return (
      <section className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_380px] lg:items-start">
          <div className="glass rounded-2xl p-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
              {isYoutubeUrl(videoUrl) ? (
                <ReactPlayer
                  ref={playerRef}
                  url={videoUrl}
                  controls
                  width="100%"
                  height="100%"
                />
              ) : (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="aspect-video h-full w-full rounded-xl bg-black"
                />
              )}

              {subtitleSettings.position ===
                "overlay" &&
                subtitleOverlay}
            </div>

            {subtitleSettings.position ===
              "below" &&
              subtitleBelow}

            <div className="mt-4 flex items-center justify-between gap-4">
              {subtitleControls}
            </div>

            <div className="mt-4 grid gap-2">
              {topTimeline.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    jumpTo(m.timestamp)
                  }
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-cyan-400/60"
                >
                  {formatTs(m.timestamp)} —{" "}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <aside className="glass flex max-h-[min(85vh,920px)] flex-col rounded-2xl p-4">
            {chatSlot}
          </aside>
        </div>

        {transcriptPanel}
      </section>
    );
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[1.25fr_.75fr]">
      <div className="glass rounded-2xl p-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          {isYoutubeUrl(videoUrl) ? (
            <ReactPlayer
              ref={playerRef}
              url={videoUrl}
              controls
              width="100%"
              height="100%"
            />
          ) : (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="aspect-video h-full w-full rounded-xl bg-black"
            />
          )}

          {subtitleSettings.position ===
            "overlay" &&
            subtitleOverlay}
        </div>

        {subtitleSettings.position ===
          "below" &&
          subtitleBelow}

        <div className="mt-4 flex items-center justify-between gap-4">
          {subtitleControls}
        </div>

        <div className="mt-4 grid gap-2">
          {topTimeline.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                jumpTo(m.timestamp)
              }
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-cyan-400/60"
            >
              {formatTs(m.timestamp)} —{" "}
              {m.label}
            </button>
          ))}
        </div>

        {transcriptPanel}
      </div>
    </section>
  );
}