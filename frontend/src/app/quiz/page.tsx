"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function QuizPage() { return <ProtectedRoute><Suspense fallback={<PageShell title="Lecture Quiz" subtitle="Loading lecture context…" />}><QuizContent /></Suspense></ProtectedRoute>; }

function QuizContent() {
  const params = useSearchParams();
  const lectureId = params.get("lectureId") || "";
  const [lectures, setLectures] = useState<any[]>([]);
  const [selectedLecture, setSelectedLecture] = useState(lectureId);
  const [quiz, setQuiz] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { api.get("/lectures").then((r) => setLectures(r.data || [])).catch(() => setMessage("Could not load lectures.")); }, []);
  async function generate() {
    if (!selectedLecture) return;
    setLoading(true); setMessage(""); setResult(null);
    try { const { data } = await api.post("/sih/quiz/generate-from-lecture", { lectureId: selectedLecture, count: 8, autoPublish: false }); setMessage(`Generated ${data.saved} validated MCQs via ${data.provider}. They are pending faculty review before publication.`); }
    catch (e: any) { setMessage(e?.response?.data?.message || "Quiz generation failed."); }
    finally { setLoading(false); }
  }
  async function submit() {
    if (!quiz?.quiz?.id) return;
    setLoading(true);
    try { const { data } = await api.post(`/sih/quizzes/${quiz.quiz.id}/submit`, { answers: (quiz.questions || []).map((q: any) => ({ questionId: q._id, selected: answers[q._id] || "" })) }); setResult(data); setQuiz(null); }
    catch (e: any) { setMessage(e?.response?.data?.message || "Quiz submission failed."); }
    finally { setLoading(false); }
  }
  return <PageShell title="Lecture Quiz" subtitle="Generate and complete a server-evaluated quiz grounded in uploaded material." actions={<Link href={selectedLecture ? `/player?lectureId=${selectedLecture}` : "/player"} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Back to player</Link>}>
    {!quiz && !result ? <div className="rounded-xl border border-white/10 bg-white/5 p-5"><div className="flex flex-wrap gap-3"><select value={selectedLecture} onChange={(e) => setSelectedLecture(e.target.value)} className="min-w-60 rounded-lg border border-white/10 bg-white/5 p-3 text-sm"><option value="">Select lecture</option>{lectures.map((l) => <option key={l._id} value={l._id}>{l.title}</option>)}</select><button type="button" disabled={loading || !selectedLecture} onClick={generate} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white disabled:opacity-50">{loading ? "Generating…" : "Generate quiz"}</button></div></div> : null}
    {message ? <p className="mt-4 text-sm text-rose-200">{message}</p> : null}
    {quiz ? <div className="mt-6 space-y-4"><h2 className="text-xl font-medium">{quiz.quiz.title}</h2>{quiz.questions.map((q: any, index: number) => <fieldset key={q._id} className="rounded-xl border border-white/10 bg-white/5 p-5"><legend className="text-white">{index + 1}. {q.question}</legend><div className="mt-3 grid gap-2 text-sm">{(["A", "B", "C", "D"] as const).map((option) => <label key={option} className="flex gap-2"><input type="radio" name={q._id} checked={answers[q._id] === option} onChange={() => setAnswers({ ...answers, [q._id]: option })} />{option}. {q.options?.[option]}</label>)}</div></fieldset>)}<button type="button" disabled={loading} onClick={submit} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">Submit for evaluation</button></div> : null}
    {result ? <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5"><h2 className="text-xl font-medium">Evaluation</h2><p className="mt-2">{result.attempt.correctCount}/{result.attempt.total} correct · {result.attempt.percentage}% · {result.attempt.passed ? "Passed" : "Not passed"}</p>{result.feedback?.feedback ? <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{result.feedback.feedback}</p> : null}<ul className="mt-5 space-y-3 text-sm">{result.review.map((item: any) => <li key={item.id} className="rounded border border-white/10 p-3"><p>{item.question}</p><p className={item.isCorrect ? "text-emerald-300" : "text-rose-300"}>Correct answer: {item.correctAnswer}</p><p className="text-zinc-400">{item.explanation}</p></li>)}</ul><button type="button" onClick={() => setResult(null)} className="mt-5 rounded-lg border border-white/15 px-3 py-2 text-sm">Try another quiz</button></div> : null}
    {!lectures.length && !message ? <div className="mt-4"><EmptyState message="Upload or import a lecture before generating a quiz." /></div> : null}
  </PageShell>;
}
