"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell, StatCard } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function FacultyAnalyticsPage() {
  return (
    <RoleGate roles={["faculty", "admin"]}>
      <Analytics />
    </RoleGate>
  );
}

function Analytics() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/faculty/dashboard").then((res) => setData(res.data)).catch(() => setError("Could not load faculty analytics."));
  }, []);

  if (!data) return <PageShell title="Faculty Analytics" subtitle="Loading…" />;

  if (error) return <PageShell title="Faculty Analytics"><EmptyState message={error} /></PageShell>;

  return (
    <PageShell title="Faculty Analytics" subtitle="Derived from assigned learner quiz attempts.">
      {data.empty ? <EmptyState message={data.message} /> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <StatCard label="Learners" value={data.assignedLearners || 0} />
        <StatCard
          label="Avg performance"
          value={data.averagePerformance == null ? "—" : `${Math.round(data.averagePerformance)}%`}
        />
        <StatCard label="Attempts" value={(data.recentAttempts || []).length} />
      </div>
    </PageShell>
  );
}
