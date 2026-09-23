"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminIntegrationsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Integrations />
    </RoleGate>
  );
}

function Integrations() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get("/admin/integrations").then((res) => setData(res.data));
  }, []);

  if (!data) return <PageShell title="Integrations" subtitle="Loading…" />;

  return (
    <PageShell
      title="External Integrations"
      subtitle="Integration status is reported as LIVE, SIMULATED, DOWN, or NOT CONFIGURED. Secrets stay on the server."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-medium">iGOT Karmayogi</h2>
          <div className="mt-2">
            <StatusBadge status={data.igot?.status} />
          </div>
          <p className="mt-3 text-sm text-zinc-400">{data.igot?.message}</p>
            <p className="mt-2 text-xs text-zinc-500">
            Mode: {data.igot?.mode || data.igot?.status || "unknown"} · Env: IGOT_ENABLED={String(data.envFlags?.IGOT_ENABLED)} · Simulation={String(data.envFlags?.IGOT_SIMULATION_MODE)}
          </p>
        </article>
        <article className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-medium">NSSTA TPAC</h2>
          <div className="mt-2">
            <StatusBadge status={data.nssta?.status} />
          </div>
          <p className="mt-3 text-sm text-zinc-400">{data.nssta?.message}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Mode: {data.nssta?.mode || data.nssta?.status || "unknown"} · Env: NSSTA_ENABLED={String(data.envFlags?.NSSTA_ENABLED)} · Simulation={String(data.envFlags?.NSSTA_SIMULATION_MODE)}
          </p>
        </article>
      </div>

      <h2 className="mt-8 text-lg font-medium">AI providers</h2>
      {(data.aiProviders || []).length === 0 ? (
        <EmptyState message="No providers listed." />
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {data.aiProviders.map((p: any) => (
            <li key={p.name} className="rounded border border-white/10 p-3">
              {p.name} — configured: {String(p.configured)}
              {p.primary ? " (primary)" : ""}
            </li>
          ))}
        </ul>
      )}
      {data.recentAiFailures?.length ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm">
          <p className="font-medium text-amber-200">Latest recorded provider failures</p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {data.recentAiFailures.slice(0, 8).map((failure: any) => (
              <li key={failure._id}>{failure.provider} · {failure.errorCode} · {failure.task}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <h2 className="mt-8 text-lg font-medium">Knowledge search</h2>
      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
        <div className="flex items-center gap-2">
          <StatusBadge status={data.embeddings?.status === "configured" ? "live" : "not_configured"} />
          <span className="text-white">Embeddings / Pinecone</span>
        </div>
        <p className="mt-2 text-zinc-400">{data.embeddings?.message}</p>
      </div>
    </PageShell>
  );
}
