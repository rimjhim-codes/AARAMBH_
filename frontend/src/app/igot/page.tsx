"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";

const IGOT_PORTAL_URL = "https://portal.igotkarmayogi.gov.in";

export default function IgotPage() {
  return (
    <RoleGate roles={["employee", "faculty", "admin"]}>
      <IgotContent />
    </RoleGate>
  );
}

function IgotContent() {
  const [q, setQ] = useState("statistics sql python");
  const [data, setData] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    setMessage("");
    try {
      const [courses, enroll] = await Promise.all([
        api.get(`/igot/courses?q=${encodeURIComponent(q)}`),
        api.get("/igot/enrollments")
      ]);
      setData(courses.data);
      setEnrollments(enroll.data.enrollments || []);
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enroll(course: any) {
    try {
      const { data: res } = await api.post("/igot/enrollments", {
        courseId: course.id,
        title: course.title
      });
      setMessage(res.warning || "Enrollment recorded.");
      const enroll = await api.get("/igot/enrollments");
      setEnrollments(enroll.data.enrollments || []);
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Enrollment failed");
    }
  }

  async function markProgress(courseId: string, progressPercent: number) {
    await api.patch(`/igot/enrollments/${courseId}`, { progressPercent });
    const enroll = await api.get("/igot/enrollments");
    setEnrollments(enroll.data.enrollments || []);
  }

  return (
    <PageShell
      title="iGOT Karmayogi"
      subtitle="Live API when configured. Otherwise platform catalog results are shown and explicitly labeled as NOT live iGOT."
    >
      <div className="integration-banner">
        <StatusBadge status={data?.integration?.status || "not_configured"} />
        <span className="text-sm text-zinc-400">{data?.integration?.message}</span>
      </div>
      <p className="source-note">Source: {data?.sourceLabel || "—"}</p>

      <div className="mb-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
        iGOT Karmayogi delivers the actual course videos and reading material. Aarambh records your enrollment and progress; continue the learning content on iGOT.
      </div>
      <div className="catalog-toolbar">
        <input
          className="flex-1 rounded-lg border border-white/10 bg-white/5 p-3"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search courses by skill keywords"
        />
        <button onClick={search} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">
          Search
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-zinc-300">{message}</p> : null}
      {loading ? <div className="mt-4"><EmptyState message="Loading…" /></div> : null}

      <div className="catalog-grid mt-6">
        {(data?.courses || []).map((c: any) => (
          <article key={c.id} className="catalog-card">
            <h2 className="font-medium text-white">{c.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{c.description}</p>
            <p className="mt-2 text-xs text-zinc-500">
              {c.provider} · {c.difficulty || "n/a"} · {c.durationHours || "?"}h · source {c.source}
            </p>
            {enrollments.some((e) => e.courseId === c.id) ? (
              <a href={c.url || IGOT_PORTAL_URL} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-md bg-cyan-700 px-3 py-1.5 text-sm text-white">
                Continue on iGOT Karmayogi ↗
              </a>
            ) : (
              <button onClick={() => enroll(c)} className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-sm">
                Enroll / track
              </button>
            )}
            {!c.url ? <p className="mt-2 text-xs text-zinc-500">No specific course link was supplied; this opens the iGOT portal homepage.</p> : null}
          </article>
        ))}
      </div>

      {!loading && (data?.courses || []).length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No courses matched. Try different keywords, or configure live iGOT credentials." />
        </div>
      ) : null}

      <h2 className="section-heading-lg">My enrollments</h2>
      {enrollments.length === 0 ? (
        <div className="mt-3">
          <EmptyState message="No enrollments recorded yet." />
        </div>
      ) : (
        <ul className="enrollment-list">
          {enrollments.map((e) => (
            <li key={e._id} className="enrollment-card">
              <div className="font-medium text-white">{e.title}</div>
              <div className="text-zinc-400">
                {e.status} · {e.progressPercent}% · {e.source}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={IGOT_PORTAL_URL} target="_blank" rel="noreferrer" className="rounded border border-cyan-500/30 px-2 py-1 text-cyan-200">Continue on iGOT Karmayogi ↗</a>
                <button
                  className="rounded border border-white/15 px-2 py-1"
                  onClick={() => markProgress(e.courseId, Math.min(100, (e.progressPercent || 0) + 25))}
                >
                  +25% progress
                </button>
                <button
                  className="rounded border border-white/15 px-2 py-1"
                  onClick={() => markProgress(e.courseId, 100)}
                >
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
