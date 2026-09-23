"use client";

import { EducationalInsightBadge, EducationalSoftWarning } from "@/components/educational-insight-banner";
import { SmartPlayer } from "@/components/player/smart-player";
import { api } from "@/lib/api";
import type { EducationalInsight } from "@/lib/educational";
import { clientEffectiveTier, tierAllows } from "@/lib/educational";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";

type Lecture = {
  _id: string;
  title: string;
  sourceUrl?: string;
};

type TranscriptChunk = {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
};

type TimelineItem = {
  id: string;
  timestamp: number;
  label: string;
  importance: number;
};

type MultilingualResult = {
  status: string;
  targetLanguage: string;
  mode: "translate" | "explain";
  content: string | null;
  source?: { title?: string; contentVersion?: string };
  grounding?: { chunkIds?: string[] };
  limitations?: string[];
};

function TutorSidebar({
  lectureId,
  insight
}: {
  lectureId: string;
  insight: EducationalInsight | null;
}) {
  const [q, setQ] = useState("");
  const [out, setOut] = useState("");
  const [refs, setRefs] = useState<
    Array<{
      text: string;
      startSec: number;
      endSec: number;
    }>
  >([]);

  const [loading, setLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket: Socket = io(
      process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8080",
      {
        transports: ["websocket"]
      }
    );

    socket.on(
      "tutor:chunk",
      (payload: {
        token?: string;
        done?: boolean;
        references?: typeof refs;
        error?: string;
      }) => {
        if (payload.error) {
          setLoading(false);

          setOut((prev) => `${prev}\n${payload.error}`);

          return;
        }

        if (payload.done) {
          setLoading(false);

          if (payload.references?.length) {
            setRefs(payload.references);
          }

          return;
        }

        if (payload.token) {
          setOut((prev) => prev + payload.token);
        }
      }
    );

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const tier = clientEffectiveTier(insight);

  const tutorOk = tierAllows(tier, "tutor");

  async function streamAnswer() {
    if (
      !lectureId ||
      !q.trim() ||
      !socketRef.current?.id ||
      !tutorOk
    ) {
      return;
    }

    setOut("");
    setRefs([]);
    setLoading(true);

    try {
      await api.post("/chat/ask-stream", {
        lectureId,
        question: q,
        socketId: socketRef.current.id
      });
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col gap-3">
      <h3 className="text-lg font-medium text-zinc-100">
        AI Tutor
      </h3>

      {!tutorOk && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-200">
          Tutor feature is limited for this content.
        </div>
      )}

      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask something from this lecture..."
        className="min-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none"
      />

      <button
        type="button"
        disabled={loading || !tutorOk}
        onClick={streamAnswer}
        className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Thinking..." : "Ask AI"}
      </button>

      {out && (
        <div className="max-h-56 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-200">
          {out}
        </div>
      )}

      {refs.length > 0 && (
        <div className="space-y-2 text-xs text-zinc-400">
          <p className="font-medium text-zinc-200">
            References
          </p>

          {refs.map((r, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/5 bg-white/5 p-2"
            >
              <p>
                {Math.floor(r.startSec / 60)}:
                {String(
                  Math.floor(r.startSec % 60)
                ).padStart(2, "0")}
              </p>

              <p className="mt-1">
                {r.text.slice(0, 120)}...
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlayerPage() {
  const searchParams = useSearchParams();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [lectureId, setLectureId] = useState("");
  const [startPositionSec, setStartPositionSec] = useState(0);
  const playbackState = useRef({ positionSec: 0, durationSec: 0 });

  const [insight, setInsight] =
    useState<EducationalInsight | null>(null);

  const [videoUrl, setVideoUrl] = useState(
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
  );

  const [transcript, setTranscript] = useState<
    TranscriptChunk[]
  >([]);

  const [timeline, setTimeline] = useState<
    TimelineItem[]
  >([]);

  const [quizJson, setQuizJson] = useState("");

  const [reco, setReco] = useState("");

  const [languageCode, setLanguageCode] = useState("en");
  const [multilingual, setMultilingual] = useState<MultilingualResult | null>(null);
  
  const [busy, setBusy] = useState<string | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState("");

  useEffect(() => {
    api
      .get("/lectures")
      .then((res) => {
        setLectures(res.data || []);

        const requestedLectureId = searchParams.get("lectureId");
        if (requestedLectureId || res.data?.[0]?._id) {
          setLectureId(requestedLectureId || res.data[0]._id);
        }
      })
      .catch(console.error);
  }, [searchParams]);

  useEffect(() => {
    if (!lectureId) return;

    Promise.all([
      api.get(`/lectures/${lectureId}`),
      api.get(`/timeline?lectureId=${lectureId}`).catch(() => ({ data: [] })),
      api.get("/profile/language-preference").catch(() => ({ data: { preference: { code: "en" } } })),
      api.get(`/learning-progress/lecture/${lectureId}`).catch(() => ({ data: { progress: null } }))
    ])
      .then(([lectureRes, timelineRes, languageRes, progressRes]) => {
        const lecture = lectureRes.data?.lecture;

        const savedPosition = progressRes.data?.progress?.metadata?.positionSec;
        setStartPositionSec(typeof savedPosition === "number" && savedPosition > 0 ? savedPosition : 0);
        playbackState.current = { positionSec: 0, durationSec: 0 };

        setInsight(
          lectureRes.data?.educationalInsight || null
        );

        const chunks =
          lectureRes.data?.transcript?.chunks || [];

        setVideoUrl(
          lecture?.sourceUrl ||
            "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
        );

        setTranscript(
          chunks.map(
            (
              c: {
                embeddingId?: string;
                text: string;
                startSec: number;
                endSec: number;
              },
              idx: number
            ) => ({
              id: c.embeddingId || String(idx),
              text: c.text,
              startSec: c.startSec,
              endSec: c.endSec
            })
          )
        );

        setTimeline(timelineRes.data || []);
        setLanguageCode(languageRes.data?.preference?.code || "en");
      })
      .catch(console.error);

    setQuizJson("");
    setReco("");
    setMultilingual(null);
  }, [lectureId]);

  useEffect(() => {
    if (!lectureId) return;

    const tick = () => {
      const { positionSec, durationSec } = playbackState.current;
      api
        .post("/study/watch-time", {
          seconds: 45,
          lectureId,
          positionSec,
          durationSec
        })
        .catch(() => {});
    };

    const id = window.setInterval(tick, 45000);

    tick();

    return () => {
      window.clearInterval(id);
    };
  }, [lectureId]);

  const tier = clientEffectiveTier(insight);

  const quizOk = tierAllows(tier, "quiz");

  const recoOk = tierAllows(tier, "reco");

  async function run(
    action: "quiz" | "reco"
  ) {
    if (!lectureId) return;

    setBusy(action);

    try {
      if (action === "quiz") {
        const { data } = await api.post(
          "/quiz/generate",
          {
            lectureId
          }
        );

        setQuizJson(
          JSON.stringify(
            data.questions || [],
            null,
            2
          )
        );
      } else {
        const { data } = await api.post(
          "/learning/recommendations",
          {
            lectureId
          }
        );

        setReco(data.recommendations || "");
      }
    } finally {
      setBusy(null);
    }
  }

  async function transform(mode: "translate" | "explain") {
    if (!lectureId || languageCode === "en") return;
    setBusy(mode);
    setAudioUrl(null);
    setAudioError("");
    try {
      const { data } = await api.post("/content-intelligence/multilingual", {
        lectureId,
        mode,
        targetLanguage: languageCode
      });
      setMultilingual(data);
    } catch {
      setMultilingual({ status: "PROVIDER_FAILURE", targetLanguage: languageCode, mode, content: null, limitations: ["request_failed"] });
    } finally {
      setBusy(null);
    }
  }

  async function generateAudio() {
    if (!multilingual?.content || generatingAudio) return;
    setGeneratingAudio(true);
    setAudioError("");
    try {
      const res = await api.post("/sih/tts/generate", {
        text: multilingual.content,
        lectureId
      });
      if (res.data?.audioBase64) {
        setAudioUrl(`data:audio/wav;base64,${res.data.audioBase64}`);
      }
    } catch (e: any) {
      console.error("Audio generation failed", e);
      setAudioError("Audio generation failed. " + (e?.response?.data?.message || "Check server logs."));
    } finally {
      setGeneratingAudio(false);
    }
  }

  return (
    <div>
      <section className="mx-auto max-w-7xl space-y-4 px-6 pt-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1 space-y-3">
            <EducationalSoftWarning insight={insight} />

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-zinc-400">
                Lecture
              </label>

              <EducationalInsightBadge insight={insight} />
            </div>

            <select
              value={lectureId}
              onChange={(e) =>
                setLectureId(e.target.value)
              }
              className="glass mt-1 w-full max-w-xl rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <option value="">
                Select lecture
              </option>

              {lectures.map((l) => (
                <option
                  key={l._id}
                  value={l._id}
                >
                  {l.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                !lectureId ||
                busy !== null ||
                !quizOk
              }
              onClick={() => run("quiz")}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              {busy === "quiz"
                ? "..."
                : "Generate Quiz"}
            </button>

            <button
              type="button"
              disabled={
                !lectureId ||
                busy !== null ||
                !recoOk
              }
              onClick={() => run("reco")}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              {busy === "reco"
                ? "..."
                : "Study Plan"}
            </button>

            <button
              type="button"
              disabled={!lectureId || languageCode === "en" || busy !== null}
              onClick={() => transform("translate")}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              {busy === "translate" ? "..." : `Translate (${languageCode.toUpperCase()})`}
            </button>

            <button
              type="button"
              disabled={!lectureId || languageCode === "en" || busy !== null}
              onClick={() => transform("explain")}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              {busy === "explain" ? "..." : `Explain (${languageCode.toUpperCase()})`}
            </button>
          </div>
        </div>

        {multilingual && (
          <section className="glass rounded-2xl p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-cyan-300">
                ARAMBH {multilingual.mode === "translate" ? "translation" : "explanation"} · {multilingual.targetLanguage.toUpperCase()}
              </h2>
              <span className="text-xs text-zinc-400">{multilingual.status}</span>
            </div>
            {multilingual.content ? (
              <div className="mt-3">
                <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">{multilingual.content}</p>
                <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={generateAudio}
                      disabled={generatingAudio}
                      className="rounded bg-cyan-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      aria-label="Listen to explanation"
                    >
                      {generatingAudio ? "Generating Teacher Voice..." : "Listen to Explanation"}
                    </button>
                    {audioUrl && (
                      <audio controls src={audioUrl} className="h-8 max-w-[200px]" autoPlay aria-label="Audio explanation playback" />
                    )}
                  </div>
                  {audioError && <p className="text-xs text-rose-400">{audioError}</p>}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-amber-200">Multilingual content is not available for this request.</p>
            )}
            {multilingual.limitations?.length ? (
              <p className="mt-3 text-xs text-zinc-500">{multilingual.limitations.join(" · ")}</p>
            ) : null}
          </section>
        )}

        {(quizJson || reco) && (
          <div className="glass grid gap-4 rounded-2xl p-4 lg:grid-cols-2">
            {quizJson && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-purple-400">
                  Quiz
                </p>

                <pre className="mt-2 text-xs text-zinc-300">
                  {quizJson}
                </pre>
              </div>
            )}

            {reco && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-400">
                  Recommendations
                </p>

                <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-300">
                  {reco}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      <SmartPlayer
        videoUrl={videoUrl}
        transcript={transcript}
        timeline={timeline}
        notebookLayout
        startPositionSec={startPositionSec}
        onPlaybackStatus={(pos, dur) => {
          playbackState.current = { positionSec: pos, durationSec: dur };
        }}
        chatSlot={
          <TutorSidebar
            lectureId={lectureId}
            insight={insight}
          />
        }
      />
    </div>
  );
}
