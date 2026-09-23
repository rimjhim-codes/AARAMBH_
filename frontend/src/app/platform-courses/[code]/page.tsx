"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function PlatformCoursePage() {
  const params = useParams<{ code: string }>();
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const response = await api.get(`/platform/courses/${encodeURIComponent(params.code)}`);
      setData(response.data);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Could not load this course.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.code) load();
  }, [params.code]);

  async function enroll() {
    try {
      await api.post(`/platform/courses/${encodeURIComponent(params.code)}/enroll`);
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Could not enroll in this course.");
    }
  }

  if (loading) return <PageShell title="Platform Course"><EmptyState message="Loading course…" /></PageShell>;
  if (message && !data) return <PageShell title="Platform Course"><EmptyState message={message} /></PageShell>;

  const lectures = data?.lectures || [];
  return (
    <PageShell title={data?.course?.title || "Platform Course"} subtitle="Aarambh-owned course content is delivered through faculty-uploaded lectures and the existing lecture player.">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
        This is an Aarambh platform course. Its attached lectures, parsed documents, embedded media, and generated quizzes are opened through the existing learning tools.
      </div>
      {!data?.enrollment ? <button onClick={enroll} className="mt-4 rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">Enroll in course</button> : <p className="mt-4 text-sm text-zinc-300">Enrollment: {data.enrollment.status}</p>}
      {data?.progress && <p className="mt-2 text-sm text-zinc-300">Course progress: {data.progress.progressPercent}% · {data.progress.status.replace("_", " ")}</p>}
      {lectures.length === 0 ? (
        <div className="mt-6"><EmptyState message="Content for this course has not been uploaded yet. Faculty must attach materials before learners can open it." /></div>
      ) : (
        <div className="mt-6 space-y-3">
          {lectures.map((lecture: any) => (
            <article key={lecture._id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-medium text-white">{lecture.title}</h2>
              <p className="mt-1 text-xs text-zinc-400">{lecture.sourceType} · {lecture.status}</p>
              <p className="mt-2 text-xs text-zinc-400">Progress: {(data.lectureProgress || []).find((item: any) => item.resourceId === lecture._id)?.progressPercent || 0}%</p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link href={`/player?lectureId=${lecture._id}`} className="rounded bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-500 transition-colors font-medium text-center">Play Lecture</Link>
                <Link href={`/quiz?lectureId=${lecture._id}`} className="rounded bg-zinc-800 px-4 py-2 text-zinc-300 hover:bg-zinc-700 transition-colors text-center">Open AI quiz</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
