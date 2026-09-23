"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminNsstaPage() {
  return (
    <RoleGate roles={["admin"]}>
      <PageShell title="Admin NSSTA TPAC" subtitle="Integration status and programme catalogue.">
        <NsstaAdmin />
      </PageShell>
    </RoleGate>
  );
}

function NsstaAdmin() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { Promise.all([api.get("/admin/integrations"), api.get("/nssta/programmes?q=statistics")]).then(([s, p]) => setData({ ...s.data, programmes: p.data.programmes || [], sourceLabel: p.data.sourceLabel })).catch(() => setData({ error: true })); }, []);
  if (!data) return <p className="text-sm text-zinc-400">Loading NSSTA status…</p>;
  if (data.error) return <EmptyState message="Could not load NSSTA status." />;
  return <div><div className="rounded-xl border border-white/10 bg-white/5 p-5"><div className="flex items-center justify-between"><h2 className="font-medium">NSSTA TPAC</h2><StatusBadge status={data.nssta?.status || "not_configured"} /></div><p className="mt-2 text-sm text-zinc-400">{data.nssta?.message}</p><Link href="/admin/integrations" className="mt-4 inline-block text-sm text-cyan-300">View integration status</Link></div><h2 className="mt-6 font-medium">Programme preview</h2><p className="mt-1 text-xs text-zinc-500">{data.sourceLabel}</p>{data.programmes.length ? <ul className="mt-3 space-y-2 text-sm">{data.programmes.map((programme: any) => <li key={programme.id} className="rounded border border-white/10 p-3">{programme.title}<span className="ml-2 text-xs text-zinc-500">{programme.provider}</span></li>)}</ul> : <EmptyState message="No programmes returned." />}</div>;
}
