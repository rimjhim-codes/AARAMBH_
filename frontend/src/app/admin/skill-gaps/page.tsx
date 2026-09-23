"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminSkillGapsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Gaps />
    </RoleGate>
  );
}

function Gaps() {
  const [gaps, setGaps] = useState<any[]>([]);
  const [predictive, setPredictive] = useState<any>(null);

  useEffect(() => {
    Promise.all([api.get("/admin/skill-gaps"), api.get("/admin/analytics/predictive")]).then(
      ([g, p]) => {
        setGaps(g.data.gaps || []);
        setPredictive(p.data);
      }
    );
  }, []);

  return (
    <PageShell
      title="Organization Skill Gaps"
      subtitle="Aggregated from stored employee skill-gap records."
    >
      {gaps.length === 0 ? (
        <EmptyState message="No org skill-gap data yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr>
                <th className="p-3">Competency</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Learners</th>
                <th className="p-3">Avg gap</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g, idx) => (
                <tr key={idx} className="border-t border-white/10">
                  <td className="p-3">{g.competency}</td>
                  <td className="p-3 uppercase">{g.priority}</td>
                  <td className="p-3">{g.count}</td>
                  <td className="p-3">{g.avgGap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-medium">Predictive outlook</h2>
      {predictive?.status === "insufficient_data" ? (
        <EmptyState message={predictive.message} />
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {(predictive?.predictions || []).map((p: any) => (
            <li key={p.competency} className="rounded border border-white/10 p-3">
              {p.competency}: avg gap {p.avgGap}, learners {p.learnersAffected} — {p.outlook}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
