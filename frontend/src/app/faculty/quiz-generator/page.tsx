"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";
import { LANGUAGES, languageTier } from "@/lib/languages";

export default function FacultyQuizGeneratorPage() {
  return (
    <RoleGate roles={["faculty", "admin"]}>
      <Generator />
    </RoleGate>
  );
}

function Generator() {
  const [lectures, setLectures] = useState<any[]>([]);
  const [lectureId, setLectureId] = useState("");
  const [count, setCount] = useState(8);
  const [language, setLanguage] = useState("English");
  const [message, setMessage] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    api.get("/lectures").then((res) => setLectures(res.data || []));
  }, []);

  async function generate() {
    setMessage("");
    try {
      const { data } = await api.post("/sih/quiz/generate-from-lecture", {
        lectureId,
        count,
        language,
        autoPublish: false
      });
      setQuestions(data.questions || []);
      setMessage(`Saved ${data.saved} questions for review (provider: ${data.provider}).`);
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Generation failed");
    }
  }

  async function publishQuiz() {
    if (!questions.length) return;
    if (questions.some((q) => !["approved", "published"].includes(q.status))) {
      setMessage("Review and approve every question before publishing the quiz.");
      return;
    }
    const { data } = await api.post("/sih/quizzes", {
      title: `Faculty quiz ${new Date().toLocaleString()}`,
      questionIds: questions.map((q) => q._id),
      lectureId,
      status: "published"
    });
    setMessage(`Published quiz ${data.quiz?.id}`);
  }

  async function approveQuestion(id: string) {
    try {
      const { data } = await api.patch(`/sih/questions/${id}/review`, { status: "approved" });
      setQuestions((items) => items.map((item) => item._id === id ? data.question : item));
      setMessage("Question approved. Continue reviewing the remaining questions.");
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Question approval failed");
    }
  }

  return (
    <PageShell
      title="Faculty Quiz Generator"
      subtitle="Generate schema-validated MCQs from lecture materials, then publish."
    >
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-white/10 bg-white/5 p-3"
          value={lectureId}
          onChange={(e) => {
            const selected = lectures.find((lecture) => lecture._id === e.target.value);
            setLectureId(e.target.value);
            setLanguage(selected?.language || "English");
          }}
        >
          <option value="">Select material</option>
          {lectures.map((l) => (
            <option key={l._id} value={l._id}>
              {l.title}
            </option>
          ))}
        </select>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 p-3" title={languageTier(language) === 2 ? "Beta / response quality may vary" : undefined}>
          {LANGUAGES.map(([name, code, tier]) => <option key={code} value={name}>{name}{tier === 2 ? " · Beta" : ""}</option>)}
        </select>
        <input
          type="number"
          min={1}
          max={20}
          className="w-24 rounded-lg border border-white/10 bg-white/5 p-3"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button onClick={generate} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">
          Generate MCQs
        </button>
        <button onClick={publishQuiz} disabled={!questions.length || questions.some((q) => !["approved", "published"].includes(q.status))} className="rounded-lg border border-white/15 px-4 py-2 text-sm disabled:opacity-40">
          Publish as quiz
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      {questions.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No generated questions in this session yet." />
        </div>
      ) : (
        <ul className="mt-4 space-y-3 text-sm">
          {questions.map((q) => (
            <li key={q._id} className="rounded border border-white/10 p-3">
              <div className="text-white">{q.question}</div>
              <div className="text-zinc-400">
                Answer {q.correctAnswer} · {q.difficulty} · {q.status}
              </div>
              {!['approved', 'published'].includes(q.status) ? (
                <button onClick={() => approveQuestion(q._id)} className="mt-2 rounded border border-emerald-400/30 px-2 py-1 text-xs text-emerald-300">
                  Approve question
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
