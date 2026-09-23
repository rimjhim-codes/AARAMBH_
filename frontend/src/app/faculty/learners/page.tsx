"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function FacultyLearnersPage() {
  return (
    <RoleGate roles={["faculty", "admin"]}>
      <Learners />
    </RoleGate>
  );
}

function Learners() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [learnerId, setLearnerId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const { data } = await api.get("/faculty/learners");
    setAssignments(data.assignments || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function assign() {
    try {
      await api.post("/faculty/assign", { learnerId });
      setMessage("Learner assigned.");
      setLearnerId("");
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Assign failed");
    }
  }

  return (
    <PageShell title="Faculty Learners" subtitle="Assign employees to your coaching roster.">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-white/10 bg-white/5 p-3"
          placeholder="Employee user Mongo ID"
          value={learnerId}
          onChange={(e) => setLearnerId(e.target.value)}
        />
        <button onClick={assign} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">
          Assign
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      {assignments.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No learners assigned." />
        </div>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {assignments.map((a) => (
            <li key={a._id} className="rounded border border-white/10 p-3">
              {(a.learnerId as any)?.name || a.learnerId} — {(a.learnerId as any)?.email}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
