"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell, StatCard, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminDashboardPage() {
  return (
    <RoleGate roles={["admin"]}>
      <AdminDash />
    </RoleGate>
  );
}

function AdminDash() {
  const [data, setData] = useState<any>(null);
  const [integ, setInteg] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [interviewBusy, setInterviewBusy] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get("/admin/dashboard"), api.get("/admin/integrations"), api.get("/admin/role-requests")])
      .then(([d, i, r]) => {
        setData(d.data);
        setInteg(i.data);
        setRequests(r.data.requests || []);
      })
      .catch((err) => setError(err?.response?.data?.message || "Failed to load administrator data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageShell title="Admin Dashboard" subtitle="Loading…" />;
  if (error) return <PageShell title="Admin Dashboard"><EmptyState message={error} /></PageShell>;

  return (
    <PageShell
      title="Administrator Dashboard"
      subtitle="Organization-level competency and training intelligence from stored data."
      actions={
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/users" className="rounded border border-white/15 px-3 py-2">
            Users
          </Link>
          <Link href="/admin/competencies" className="rounded border border-white/15 px-3 py-2">
            Competencies
          </Link>
          <Link href="/admin/integrations" className="rounded border border-white/15 px-3 py-2">
            Integrations
          </Link>
          <Link href="/admin/settings" className="rounded border border-white/15 px-3 py-2">
            Settings
          </Link>
          <Link href="/admin/skill-gaps" className="rounded border border-white/15 px-3 py-2">
            Org gaps
          </Link>
          <Link href="/admin/audit" className="rounded border border-white/15 px-3 py-2">
            Audit
          </Link>
        </div>
      }
    >
      {data?.empty ? <EmptyState message={data.message || "No org data yet."} /> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <StatCard label="Employees" value={data?.totals?.employees ?? 0} />
        <StatCard label="Faculty" value={data?.totals?.faculty ?? 0} />
        <StatCard label="Active learners" value={data?.totals?.activeLearners ?? 0} />
        <StatCard
          label="Avg quiz %"
          value={
            data?.averageQuizPerformance == null
              ? "—"
              : `${Math.round(data.averageQuizPerformance)}%`
          }
          hint={`${data?.quizAttemptCount || 0} attempts`}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <div className="rounded border border-white/10 px-3 py-2">
          iGOT <StatusBadge status={integ?.igot?.status || "not_configured"} />
        </div>
        <div className="rounded border border-white/10 px-3 py-2">
          NSSTA <StatusBadge status={integ?.nssta?.status || "not_configured"} />
        </div>
      </div>
      {(data?.flaggedAttempts || []).length > 0 ? (
        <section className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
          <h2 className="font-medium text-amber-100">Assessment integrity flags</h2>
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
      <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-white">Pending Role Requests</h2>
            <p className="mt-1 text-sm text-zinc-400">Review employee requests for Faculty access.</p>
          </div>
          <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">{requests.length} pending</span>
        </div>
        {requests.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No pending requests.</p> : <div className="mt-4 space-y-3">
          {requests.map((request) => <div key={request._id} className="rounded-lg border border-white/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 text-sm"><p className="font-medium text-white">{request.userId?.name || "Unknown user"}</p><p className="mt-1 text-zinc-400">{request.userId?.email} · Faculty access</p>
                <dl className="mt-4 space-y-3"><div><dt className="text-xs uppercase tracking-wide text-zinc-500">Designation</dt><dd className="mt-1 text-zinc-200">{request.designationSnapshot}</dd></div><div><dt className="text-xs uppercase tracking-wide text-zinc-500">Justification</dt><dd className="mt-1 whitespace-pre-wrap text-zinc-300">{request.justification}</dd></div>{request.experienceNotes ? <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Certifications / prior experience</dt><dd className="mt-1 whitespace-pre-wrap text-zinc-300">{request.experienceNotes}</dd></div> : null}{request.supportingDocument?.url ? <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Supporting document</dt><dd className="mt-1"><a href={request.supportingDocument.url} target="_blank" rel="noreferrer" className="text-cyan-300 underline">{request.supportingDocument.originalName || "Open document"}</a></dd></div> : null}<div><dt className="text-xs uppercase tracking-wide text-zinc-500">Interview</dt><dd className="mt-2 flex items-center gap-2"><input type="checkbox" checked={Boolean(request.interviewConducted)} disabled={interviewBusy === request._id} onChange={(event) => updateInterview(request._id, event.target.checked, request.interviewNotes || "")} /><span className="text-zinc-300">Interview conducted</span></dd><textarea defaultValue={request.interviewNotes || ""} onBlur={(event) => updateInterview(request._id, Boolean(request.interviewConducted), event.target.value)} maxLength={600} rows={2} className="sih-field mt-2 w-full" placeholder="Optional interview notes" /></div></dl>
              </div>
              <div className="flex shrink-0 gap-2"><button onClick={() => { setRejectingId(request._id); setRejectionReason(""); }} className="rounded border border-rose-400/30 px-3 py-1.5 text-xs text-rose-200">Reject</button><button onClick={() => reviewRequest(request._id, "approved")} className="rounded bg-cyan-700 px-3 py-1.5 text-xs text-white">Approve</button></div>
            </div>
            {rejectingId === request._id ? <div className="mt-4 max-w-2xl rounded-lg border border-rose-400/20 bg-rose-500/5 p-3"><label className="text-sm text-zinc-300">Reason for rejection</label><textarea required minLength={5} maxLength={600} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={3} className="sih-field mt-2 w-full" placeholder="Explain what the employee should address." /><div className="mt-2 flex gap-2"><button onClick={() => reviewRequest(request._id, "rejected")} className="rounded bg-rose-700 px-3 py-1.5 text-xs text-white">Confirm rejection</button><button type="button" onClick={() => setRejectingId(null)} className="rounded border border-white/15 px-3 py-1.5 text-xs text-zinc-300">Cancel</button></div></div> : null}
          </div>)}
        </div>}
      </section>
    </PageShell>
  );

  async function reviewRequest(id: string, status: "approved" | "rejected") {
    if (status === "rejected" && rejectionReason.trim().length < 5) {
      setError("Please provide a rejection reason of at least 5 characters.");
      return;
    }
    try {
      await api.patch(`/admin/role-requests/${id}`, { status, ...(status === "rejected" ? { rejectionReason } : {}) });
      setRequests((current) => current.filter((request) => request._id !== id));
      setRejectingId(null);
      setRejectionReason("");
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not review role request.");
    }
  }

  async function updateInterview(id: string, interviewConducted: boolean, interviewNotes: string) {
    setInterviewBusy(id);
    try {
      const { data } = await api.patch(`/admin/role-requests/${id}/interview`, { interviewConducted, interviewNotes });
      setRequests((current) => current.map((request) => request._id === id ? { ...request, ...data.request } : request));
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not save interview tracking.");
    } finally {
      setInterviewBusy(null);
    }
  }
}
