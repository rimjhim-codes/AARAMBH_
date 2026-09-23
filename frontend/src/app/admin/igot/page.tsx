"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminIgotPage() {
  return (
    <RoleGate roles={["admin"]}>
      <PageShell title="Admin iGOT" subtitle="Integration status and catalogue access.">
        <IgotAdmin />
      </PageShell>
    </RoleGate>
  );
}

function IgotAdmin() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { Promise.all([api.get("/admin/integrations"), api.get("/igot/courses?q=statistics")]).then(([s, c]) => setData({ ...s.data, courses: c.data.courses || [], sourceLabel: c.data.sourceLabel })).catch(() => setData({ error: true })); }, []);
  if (!data) return <p className="text-sm text-zinc-400">Loading iGOT status…</p>;
  if (data.error) return <EmptyState message="Could not load iGOT status." />;
  return <div><div className="rounded-xl border border-white/10 bg-white/5 p-5"><div className="flex items-center justify-between"><h2 className="font-medium">iGOT Karmayogi</h2><StatusBadge status={data.igot?.status || "not_configured"} /></div><p className="mt-2 text-sm text-zinc-400">{data.igot?.message}</p><Link href="/admin/integrations" className="mt-4 inline-block text-sm text-cyan-300">View integration status</Link></div><h2 className="mt-6 font-medium">Catalogue preview</h2><p className="mt-1 text-xs text-zinc-500">{data.sourceLabel}</p>{data.courses.length ? <ul className="mt-3 space-y-2 text-sm">{data.courses.map((course: any) => <li key={course.id} className="rounded border border-white/10 p-3">{course.title}<span className="ml-2 text-xs text-zinc-500">{course.provider}</span></li>)}</ul> : <EmptyState message="No catalogue courses returned." />}</div>;
}
