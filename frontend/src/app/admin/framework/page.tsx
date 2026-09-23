"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminFrameworkPage() {
  return (
    <RoleGate roles={["admin"]}>
      <PageShell
        title="Competency Framework"
        subtitle="Manage the application-defined competency catalogue, versions, and role requirements."
      >
        <Framework />
      </PageShell>
    </RoleGate>
  );
}

function Framework() {
  const [competencies, setCompetencies] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [role, setRole] = useState("Statistical Officer");
  const [competencyId, setCompetencyId] = useState("");
  const [level, setLevel] = useState(3);
  const [message, setMessage] = useState("");

  async function load() {
    const [c, r, o] = await Promise.all([api.get("/admin/competencies"), api.get("/role-requirements"), api.get("/admin/framework/overview")]);
    setCompetencies(c.data.competencies || []);
    setRequirements(r.data.requirements || []);
    setOverview(o.data);
    if (!competencyId && c.data.competencies?.[0]?._id) setCompetencyId(c.data.competencies[0]._id);
  }
  useEffect(() => { load().catch(() => setMessage("Could not load framework data.")); }, []);

  async function saveRequirement() {
    try { await api.post("/admin/role-requirements", { jobRole: role, competencyId, requiredLevel: level }); setMessage("Role requirement saved."); await load(); }
    catch (e: any) { setMessage(e?.response?.data?.message || "Could not save requirement."); }
  }

  return <div>
    <div className="mt-5 grid gap-3 md:grid-cols-4">
      <div className="rounded-xl border border-white/10 p-4"><span className="text-xs text-zinc-500">Framework</span><strong className="mt-1 block text-sm">{overview?.framework?.frameworkName || "Not initialized"}</strong></div>
      <div className="rounded-xl border border-white/10 p-4"><span className="text-xs text-zinc-500">Version / status</span><strong className="mt-1 block text-sm">{overview?.framework ? `${overview.framework.version} · ${overview.framework.status}` : "—"}</strong></div>
      <div className="rounded-xl border border-white/10 p-4"><span className="text-xs text-zinc-500">Competencies</span><strong className="mt-1 block text-sm">{overview?.competencyCount ?? "—"}</strong></div>
      <div className="rounded-xl border border-white/10 p-4"><span className="text-xs text-zinc-500">Role requirements</span><strong className="mt-1 block text-sm">{overview?.roleRequirementCount ?? "—"}</strong></div>
    </div>
    {overview?.framework ? <p className="mt-3 text-xs text-amber-300">Application-defined legacy framework. No official Government of India authority is asserted. Source: {overview.framework.sourceReference || "not registered"}.</p> : null}
    <div className="flex flex-wrap gap-3"><Link href="/admin/competencies" className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">Manage competencies</Link><Link href="/admin/users" className="rounded-lg border border-white/15 px-4 py-2 text-sm">Users / roles</Link></div>
    <div className="mt-5 grid gap-2 rounded-xl border border-white/10 p-4 md:grid-cols-3">
      <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Job role" className="rounded border border-white/10 bg-white/5 p-2" />
      <select value={competencyId} onChange={(e) => setCompetencyId(e.target.value)} className="rounded border border-white/10 bg-white/5 p-2">{competencies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
      <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="rounded border border-white/10 bg-white/5 p-2">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Required level {n}</option>)}</select>
      <button type="button" disabled={!competencyId} onClick={saveRequirement} className="rounded bg-cyan-700 px-3 py-2 text-sm text-white md:col-span-3">Save role requirement</button>
    </div>
    {message ? <p className="mt-2 text-sm text-zinc-300">{message}</p> : null}
    <div className="mt-5 overflow-x-auto rounded-xl border border-white/10"><table className="min-w-full text-left text-sm"><thead className="text-zinc-400"><tr><th className="p-3">Role</th><th className="p-3">Competency</th><th className="p-3">Required level</th></tr></thead><tbody>{requirements.map((r) => <tr key={r._id} className="border-t border-white/10"><td className="p-3">{r.jobRole}</td><td className="p-3">{r.competencyId?.name || r.competencyId}</td><td className="p-3">{r.requiredLevel}</td></tr>)}</tbody></table></div>
  </div>;
}
