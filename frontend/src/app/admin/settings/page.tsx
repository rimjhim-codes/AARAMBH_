"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminSettingsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Settings />
    </RoleGate>
  );
}

function Settings() {
  const [settings, setSettings] = useState<any[]>([]);
  const [weights, setWeights] = useState({
    courseCompletion: 0.2,
    assessmentPerformance: 0.25,
    competencyAchievement: 0.25,
    trainingCompletion: 0.1,
    quizPerformance: 0.15,
    learningHoursScore: 0.05
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/admin/settings").then((res) => {
      setSettings(res.data.settings || []);
      const w = (res.data.settings || []).find(
        (s: any) => s.key === "learning_percentage_weights"
      )?.value;
      if (w) setWeights({ ...weights, ...w });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveWeights() {
    await api.put("/admin/settings", {
      key: "learning_percentage_weights",
      value: weights
    });
    setMessage("Learning percentage weights updated.");
  }

  return (
    <PageShell
      title="System Settings"
      subtitle="Configure learning-percentage weights. AI provider selection uses server environment variables."
    >
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="font-medium">Learning percentage weights</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {Object.entries(weights).map(([k, v]) => (
            <label key={k} className="text-sm text-zinc-300">
              {k}
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                className="mt-1 w-full rounded border border-white/10 bg-white/5 p-2"
                value={v}
                onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <button onClick={saveWeights} className="mt-4 rounded bg-cyan-700 px-4 py-2 text-sm text-white">
          Save weights
        </button>
        {message ? <p className="mt-2 text-sm">{message}</p> : null}
      </div>

      <h2 className="mt-8 text-lg font-medium">All settings keys</h2>
      {settings.length === 0 ? (
        <EmptyState message="No settings documents." />
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {settings.map((s) => (
            <li key={s._id} className="rounded border border-white/10 p-3">
              <span className="text-cyan-200">{s.key}</span>
              <pre className="mt-1 overflow-x-auto text-xs text-zinc-400">
                {JSON.stringify(s.value, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
