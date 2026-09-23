"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell, StatCard } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function FacultyDashboardPage() {
  return (
    <RoleGate roles={["faculty", "admin"]}>
      <FacultyDash />
    </RoleGate>
  );
}

function FacultyDash() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/faculty/dashboard")
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.data?.message || "Failed to load faculty data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageShell title="Faculty Dashboard" subtitle="Loading…" />;
  if (error) return <PageShell title="Faculty Dashboard"><EmptyState message={error} /></PageShell>;

  return (
    <PageShell
      title="Faculty Dashboard"
      subtitle="Learner performance from assigned learners and published assessments."
      actions={
        <div className="flex gap-2 text-sm">
          <Link href="/faculty/quiz-generator" className="rounded border border-white/15 px-3 py-2">
            Quiz generator
          </Link>
          <Link href="/faculty/question-bank" className="rounded border border-white/15 px-3 py-2">
            Question bank
          </Link>
          <Link href="/faculty/learners" className="rounded border border-white/15 px-3 py-2">
            Learners
          </Link>
        </div>
      }
    >
      {data?.empty ? <EmptyState message={data.message} /> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <StatCard label="Assigned learners" value={data?.assignedLearners ?? 0} />
        <StatCard
          label="Average performance"
          value={
            data?.averagePerformance == null ? "—" : `${Math.round(data.averagePerformance)}%`
          }
        />
        <StatCard label="Recent attempts" value={(data?.recentAttempts || []).length} />
      </div>
      {(data?.flaggedAttempts || []).length > 0 ? (
        <section className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
          <h2 className="font-medium text-amber-100">Attempts flagged for review</h2>
          <div className="mt-3 space-y-2 text-sm">
            {data.flaggedAttempts.map((attempt: any) => (
              <div key={attempt._id} className="rounded border border-amber-400/15 p-3">
                <div className="text-zinc-200">{attempt.userId?.name || attempt.userId?.email || "Learner"} · {attempt.quizId?.title || "Quiz"}</div>
                <div className="mt-1 text-xs text-amber-200">{attempt.suspiciousActivityReasons?.join(", ") || "Suspicious activity detected"} · {attempt.suspiciousActivityCount} flag(s)</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
