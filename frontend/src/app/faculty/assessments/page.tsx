"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function FacultyAssessmentsPage() {
  return (
    <RoleGate roles={["faculty", "admin"]}>
      <AssessmentReviewQueue />
    </RoleGate>
  );
}

function AssessmentReviewQueue() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    const { data } = await api.get("/sih/questions");
    setQuestions(data.questions || []);
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err?.response?.data?.message || "Could not load the review queue."))
      .finally(() => setLoading(false));
  }, []);

  async function review(id: string, status: "approved" | "rejected") {
    try {
      const payload: { status: "approved" | "rejected"; feedback?: string } = {
        status,
        ...(status === "rejected" ? { feedback: "Question rejected for revision. Please update the item and resubmit." } : {})
      };
      await api.patch(`/sih/questions/${id}/review`, payload);
      setMessage(`Question ${status}.`);
      await load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Could not update question status.");
    }
  }

  const pending = questions.filter((question) => question.status === "pending_review");

  return (
    <PageShell
      title="Faculty Assessment Review"
      subtitle="AI-generated questions remain pending until a faculty reviewer approves them."
      actions={<Link href="/faculty/quiz-generator" className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">Generate MCQs</Link>}
    >
      {loading ? <EmptyState message="Loading review queue…" /> : null}
      {error ? <EmptyState message={error} /> : null}
      {message ? <p className="mb-3 text-sm text-zinc-300">{message}</p> : null}
      {!loading && !error && pending.length === 0 ? <EmptyState message="No questions are waiting for review." /> : null}
      {pending.length > 0 ? (
        <ul className="space-y-3 text-sm">
          {pending.map((question) => (
            <li key={question._id} className="rounded-xl border border-amber-400/20 bg-white/5 p-4">
              <p className="text-white">{question.question}</p>
              <p className="mt-2 text-xs text-zinc-400">{question.topic || "General"} · {question.difficulty} · pending review</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => review(question._id, "approved")} className="rounded border border-emerald-400/30 px-3 py-1.5 text-emerald-300">Approve</button>
                <button onClick={() => review(question._id, "rejected")} className="rounded border border-rose-400/30 px-3 py-1.5 text-rose-300">Reject</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-8 flex gap-3">
        <Link href="/faculty/question-bank" className="rounded-lg border border-white/15 px-4 py-2 text-sm">Full question bank</Link>
        <Link href="/faculty/dashboard" className="rounded-lg border border-white/15 px-4 py-2 text-sm">Faculty dashboard</Link>
      </div>
    </PageShell>
  );
}
