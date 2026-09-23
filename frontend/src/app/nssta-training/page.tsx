"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";

const NSSTA_PORTAL_URL = "https://nssta.gov.in/";

export default function NsstaPage() {
  return (
    <RoleGate roles={["employee", "faculty", "admin"]}>
      <NsstaContent />
    </RoleGate>
  );
}

function NsstaContent() {
  const [q, setQ] = useState("sampling national accounts tpac");
  const [data, setData] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    try {
      const [programmes, enroll] = await Promise.all([
        api.get(`/nssta/programmes?q=${encodeURIComponent(q)}`),
        api.get("/nssta/enrollments")
      ]);
      setData(programmes.data);
      setEnrollments(enroll.data.enrollments || []);
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enroll(p: any) {
    try {
      const { data: res } = await api.post("/nssta/enrollments", {
        programmeId: p.id,
        title: p.title
      });
      setMessage(res.warning || "Programme enrollment recorded.");
      const enrollRes = await api.get("/nssta/enrollments");
      setEnrollments(enrollRes.data.enrollments || []);
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Programme enrollment failed.");
    }
  }

  async function markProgress(programmeId: string, progressPercent: number) {
    try {
      await api.patch(`/nssta/enrollments/${programmeId}`, { progressPercent });
      const enrollRes = await api.get("/nssta/enrollments");
      setEnrollments(enrollRes.data.enrollments || []);
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Programme progress synchronization failed.");
    }
  }

  return (
    <PageShell
      title="NSSTA TPAC Training Programmes"
      subtitle="Live NSSTA TPAC when configured. Otherwise TPAC-oriented platform catalogue is shown and labeled as non-live."
    >
      <div className="integration-banner">
        <StatusBadge status={data?.integration?.status || "not_configured"} />
        <span className="text-sm text-zinc-400">{data?.integration?.message}</span>
      </div>
      <p className="source-note">Source: {data?.sourceLabel || "—"}</p>

      <div className="mb-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
        NSSTA TPAC delivers the actual training content on its government platform. Aarambh records your enrollment and progress; continue the programme content on NSSTA.
      </div>
      <div className="catalog-toolbar">
        <input
          className="flex-1 rounded-lg border border-white/10 bg-white/5 p-3"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={search} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">
          Search
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      {loading ? <div className="mt-4"><EmptyState message="Loading…" /></div> : null}

      <div className="catalog-grid mt-6">
        {(data?.programmes || []).map((p: any) => (
          <article key={p.id} className="catalog-card">
            <h2 className="font-medium text-white">{p.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
            <p className="mt-2 text-xs text-zinc-500">
              {p.provider} · {p.durationHours || "?"}h · {p.source}
            </p>
            {enrollments.some((e) => e.programmeId === p.id) ? (
              <a href={p.url || NSSTA_PORTAL_URL} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-md bg-cyan-700 px-3 py-1.5 text-sm text-white">
                Continue on NSSTA TPAC ↗
              </a>
            ) : (
              <button onClick={() => enroll(p)} className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-sm">
                Track programme
              </button>
            )}
            {!p.url ? <p className="mt-2 text-xs text-zinc-500">No specific programme link was supplied; this opens the NSSTA portal homepage.</p> : null}
          </article>
        ))}
      </div>

      {!loading && (data?.programmes || []).length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No programmes matched." />
        </div>
      ) : null}

      <h2 className="section-heading-lg">My NSSTA / TPAC tracking</h2>
      {enrollments.length === 0 ? (
        <div className="mt-3">
          <EmptyState message="No programme enrollments yet." />
        </div>
      ) : (
        <ul className="enrollment-list">
          {enrollments.map((e) => (
            <li key={e._id} className="enrollment-card">
              <div>{e.title} — {e.status} ({e.source})</div>
              <a href={NSSTA_PORTAL_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded border border-cyan-500/30 px-2 py-1 text-cyan-200">Continue on NSSTA TPAC ↗</a>
              <div className="mt-2 flex gap-2">
                <button className="rounded border border-white/15 px-2 py-1" onClick={() => markProgress(e.programmeId, Math.min(100, (e.progressPercent || 0) + 25))}>
                  +25% progress
                </button>
                <button className="rounded border border-white/15 px-2 py-1" onClick={() => markProgress(e.programmeId, 100)}>
                  Mark complete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
