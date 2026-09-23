"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function QuestionBankPage() {
  return (
    <RoleGate roles={["faculty", "admin"]}>
      <Bank />
    </RoleGate>
  );
}

function Bank() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const { data } = await api.get("/sih/questions");
    setQuestions(data.questions || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: string) {
    const payload: { status: string; feedback?: string } = {
      status,
      ...(status === "rejected" ? { feedback: "Question rejected for revision. Please update the item and resubmit." } : {})
    };
    await api.patch(`/sih/questions/${id}/review`, payload);
    setMessage(`Updated ${id} → ${status}`);
    await load();
  }

  return (
    <PageShell title="Question Bank" subtitle="Review and publish AI-generated MCQs.">
      {message ? <p className="mb-3 text-sm text-zinc-300">{message}</p> : null}
      {questions.length === 0 ? (
        <EmptyState message="No questions in bank yet." />
      ) : (
        <ul className="space-y-3 text-sm">
          {questions.map((q) => (
            <li key={q._id} className="rounded border border-white/10 p-3">
              <div className="text-white">{q.question}</div>
              <div className="mt-1 text-zinc-400">
                {q.status} · {q.difficulty} · answer {q.correctAnswer}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded border border-white/15 px-2 py-1"
                  onClick={() => setStatus(q._id, "approved")}
                >
                  Approve
                </button>
                <button
                  className="rounded border border-white/15 px-2 py-1"
                  onClick={() => setStatus(q._id, "published")}
                >
                  Publish
                </button>
                <button
                  className="rounded border border-white/15 px-2 py-1"
                  onClick={() => setStatus(q._id, "rejected")}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
