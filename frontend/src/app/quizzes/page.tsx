"use client";

import { useEffect, useRef, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";

export default function QuizzesPage() {
  return (
    <RoleGate roles={["employee"]}>
      <QuizzesContent />
    </RoleGate>
  );
}

function TtsButton({ text, label = "Listen to Explanation" }: { text: string; label?: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState("");

  async function generateAudio() {
    if (!text || generatingAudio) return;
    setGeneratingAudio(true);
    setAudioError("");
    try {
      const res = await api.post("/sih/tts/generate", { text });
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
    <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
      <div className="flex items-center gap-4">
        <button
          onClick={generateAudio}
          disabled={generatingAudio}
          className="rounded bg-cyan-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          aria-label={label}
        >
          {generatingAudio ? "Generating Teacher Voice..." : label}
        </button>
        {audioUrl && (
          <audio controls src={audioUrl} className="h-8 max-w-[200px]" autoPlay aria-label="Audio playback" />
        )}
      </div>
      {audioError && <p className="text-xs text-rose-400">{audioError}</p>}
    </div>
  );
}

function QuizzesContent() {
  const { language } = useI18n();
  const [lectures, setLectures] = useState<any[]>([]);
  const [lectureId, setLectureId] = useState("");
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, "A" | "B" | "C" | "D" | "">>({});
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responseTimes, setResponseTimes] = useState<Record<string, number>>({});
  const [suspiciousActivityCount, setSuspiciousActivityCount] = useState(0);
  const [suspiciousActivityReasons, setSuspiciousActivityReasons] = useState<string[]>([]);
  const questionStartedAt = useRef<number | null>(null);

  async function refreshLists() {
    const [lec, quiz, att] = await Promise.all([
      api.get("/lectures"),
      api.get("/sih/quizzes"),
      api.get("/sih/quiz-attempts/me")
    ]);
    setLectures(lec.data || []);
    setQuizzes(quiz.data.quizzes || []);
    setAttempts(att.data.attempts || []);
  }

  useEffect(() => {
    refreshLists().catch(() => undefined);
  }, []);

  async function generateFromLecture() {
    if (!lectureId) {
      setMessage("Select a lecture first.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const { data } = await api.post("/sih/quiz/generate-from-lecture", {
        lectureId,
        count: 8,
        autoPublish: false,
        language
      });
      setMessage(
        `Generated ${data.saved} validated MCQs via ${data.provider}. They are pending faculty review before publication.`
      );
      await refreshLists();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function startQuiz(id: string) {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.get(`/sih/quizzes/${id}/attempt`);
      setActive(data);
      setCurrentQuestionIndex(0);
      setResponseTimes({});
      setSuspiciousActivityCount(0);
      setSuspiciousActivityReasons([]);
      const init: Record<string, "A" | "B" | "C" | "D" | ""> = {};
      for (const q of data.questions || []) init[q._id] = "";
      setAnswers(init);
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Could not load quiz");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    questionStartedAt.current = Date.now();
    const flag = () => {
      setSuspiciousActivityCount((count) => count + 1);
      setSuspiciousActivityReasons((reasons) =>
        reasons.includes("tab_or_window_blur") ? reasons : [...reasons, "tab_or_window_blur"]
      );
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flag(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", flag);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", flag);
    };
  }, [active, currentQuestionIndex]);

  function elapsedForCurrentQuestion() {
    const question = active?.questions?.[currentQuestionIndex];
    if (!question || questionStartedAt.current == null) return responseTimes;
    return { ...responseTimes, [question._id]: Math.max(responseTimes[question._id] || 0, Date.now() - questionStartedAt.current) };
  }

  function advanceQuestion() {
    const times = elapsedForCurrentQuestion();
    setResponseTimes(times);
    questionStartedAt.current = Date.now();
    setCurrentQuestionIndex((index) => index + 1);
  }

  async function submit() {
    if (!active?.quiz?.id) return;
    setLoading(true);
    try {
      const finalTimes = elapsedForCurrentQuestion();
      const { data } = await api.post(`/sih/quizzes/${active.quiz.id}/submit`, {
        answers: Object.entries(answers).map(([questionId, selected]) => ({
          questionId,
          selected,
          responseTimeMs: finalTimes[questionId]
        })),
        suspiciousActivityCount,
        suspiciousActivityReasons
      });
      setResult(data);
      setActive(null);
      await refreshLists();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Submit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      title="Quizzes & MCQs"
      subtitle="Generate structured MCQs from uploaded lecture materials, attempt quizzes, and get server-side evaluation."
    >
      <section className="section-card quiz-generator-panel">
        <h2 className="font-medium">Generate from uploaded material</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm"
            value={lectureId}
            onChange={(e) => setLectureId(e.target.value)}
          >
            <option value="">Select lecture</option>
            {lectures.map((l) => (
              <option key={l._id} value={l._id}>
                {l.title}
              </option>
            ))}
          </select>
          <button
            onClick={generateFromLecture}
            disabled={loading}
            className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white"
          >
            Generate MCQs + publish quiz
          </button>
        </div>
        {lectures.length === 0 ? (
          <div className="mt-3">
            <EmptyState message="No lectures yet. Upload/import content in Faculty Materials first." />
          </div>
        ) : null}
      </section>

      {message ? <p className="mt-4 text-sm text-zinc-300">{message}</p> : null}

      {!active ? (
        <div className="mt-8">
          <div className="section-card-title"><h2>Available quizzes</h2><span className="source-note">Formal evaluated attempts</span></div>
          {quizzes.length === 0 ? (
            <div className="mt-3">
              <EmptyState message="No formal quizzes yet." />
            </div>
          ) : (
            <ul className="quiz-list">
              {quizzes.map((q) => (
                <li
                  key={q._id}
                  className="quiz-card"
                >
                  <span>
                    {q.title} · {q.status} · {q.questionIds?.length || 0} Qs
                  </span>
                  {q.status === "published" ? (
                    <button
                      onClick={() => startQuiz(q._id)}
                      className="rounded border border-white/15 px-3 py-1"
                    >
                      Attempt
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-medium">{active.quiz.title}</h2>
          {active.questions?.[currentQuestionIndex] ? (() => {
            const q = active.questions[currentQuestionIndex];
            const answered = answers[q._id] !== "";
            return <div className="rounded-xl border border-white/10 p-4">
              <p className="text-white">{currentQuestionIndex + 1}. {q.question}</p>
              <div className="mt-2 grid gap-2 text-sm">
                {(["A", "B", "C", "D"] as const).map((opt) => (
                  <label key={opt} className="flex gap-2">
                    <input
                      type="radio"
                      name={q._id}
                      checked={answers[q._id] === (q.optionMap?.[opt] || opt)}
                      disabled={answered}
                      onChange={() => setAnswers({ ...answers, [q._id]: q.optionMap?.[opt] || opt })}
                    />
                    {opt}. {q.options?.[opt]}
                  </label>
                ))}
              </div>
              <button disabled={!answered || loading} onClick={currentQuestionIndex === active.questions.length - 1 ? submit : advanceQuestion} className="mt-5 rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white disabled:opacity-50">
                {currentQuestionIndex === active.questions.length - 1 ? "Submit for evaluation" : "Next question"}
              </button>
            </div>;
          })() : null}
        </div>
      )}

      {result ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-medium">Evaluation</h3>
          <p className="mt-2 text-sm">
            {result.attempt?.correctCount}/{result.attempt?.total} correct (
            {result.attempt?.percentage}%) ·{" "}
            {result.attempt?.passed ? "Passed" : "Not passed"}
          </p>
          {result.feedback?.feedback ? (
            <div className="mt-3">
              <p className="whitespace-pre-wrap text-sm text-zinc-300">
                {result.feedback.feedback}
              </p>
              <TtsButton text={result.feedback.feedback} label="Listen to Feedback" />
            </div>
          ) : null}
          <ul className="mt-4 space-y-3 text-sm">
            {(result.review || []).map((r: any) => (
              <li key={r.id} className="rounded border border-white/10 p-3">
                <div>{r.question}</div>
                <div className={r.isCorrect ? "text-emerald-300" : "text-rose-300"}>
                  Selected {r.selected || "—"} / Correct {r.correctAnswer}
                </div>
                <div className="text-zinc-400">{r.explanation}</div>
                {r.explanation && (
                  <TtsButton text={r.explanation} label="Listen to Explanation" />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 className="mt-10 text-lg font-medium">Attempt history</h2>
      {attempts.length === 0 ? (
        <div className="mt-3">
          <EmptyState message="No quiz attempts yet." />
        </div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {attempts.map((a) => (
            <li key={a._id} className="rounded border border-white/10 p-3">
              {(a.quizId as any)?.title || "Quiz"} — {a.percentage}% on{" "}
              {new Date(a.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
