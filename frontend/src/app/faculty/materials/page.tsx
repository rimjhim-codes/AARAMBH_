"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";
import { LANGUAGES } from "@/lib/languages";

export default function FacultyMaterialsPage() {
  return (
    <RoleGate roles={["faculty", "admin"]}>
      <Materials />
    </RoleGate>
  );
}

function Materials() {
  const [lectures, setLectures] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [language, setLanguage] = useState("English");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [attaching, setAttaching] = useState<Record<string, boolean>>({});
  const [selectedCourse, setSelectedCourse] = useState<Record<string, string>>({});

  async function load() {
    const [{ data: lec }, crsRes] = await Promise.all([
      api.get("/lectures"),
      api.get("/platform/courses").catch(() => ({ data: { courses: [] } }))
    ]);
    setLectures(lec || []);
    setCourses(crsRes?.data?.courses || []);
  }

  useEffect(() => {
    load().catch(() => setMessage("Could not load faculty materials."));
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      const lowerName = file.name.toLowerCase();
      form.append("file", file);
      form.append("title", file.name);
      form.append("language", language);
      form.append("sourceType", lowerName.endsWith(".pdf") ? "pdf" : lowerName.endsWith(".docx") ? "docx" : lowerName.endsWith(".pptx") ? "pptx" : lowerName.match(/\.(mp4|webm|mov|avi)$/) ? "video" : "transcript");
      await api.post("/lectures/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
      setMessage("Material uploaded and processed.");
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Material upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function importYoutube() {
    if (!youtubeUrl.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await api.post("/lectures/youtube", { youtubeUrl: youtubeUrl.trim(), language });
      setYoutubeUrl("");
      await load();
      setMessage("YouTube material imported and processed.");
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "YouTube import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function attachToCourse(lectureId: string) {
    const code = selectedCourse[lectureId];
    if (!code) return;
    setAttaching({ ...attaching, [lectureId]: true });
    setMessage("");
    try {
      const { data: courseData } = await api.get(`/platform/courses/${code}`);
      const existingIds = courseData.lectures?.map((l: any) => l._id) || [];
      if (existingIds.includes(lectureId)) {
         setMessage("Already attached to this course.");
         return;
      }
      const newIds = [...existingIds, lectureId];
      await api.patch(`/platform/courses/${code}/content`, { lectureIds: newIds });
      setMessage("Material successfully attached to course.");
      setSelectedCourse({ ...selectedCourse, [lectureId]: "" });
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Failed to attach to course.");
    } finally {
      setAttaching({ ...attaching, [lectureId]: false });
    }
  }

  return (
    <PageShell title="Faculty Materials" subtitle="Upload or import owned learning material for quiz generation and AI learning.">
      <div className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-5 md:grid-cols-2">
        <label className="text-sm text-zinc-300 md:col-span-2">Source content language
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-2 block rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white">
            {LANGUAGES.map(([name, code, tier]) => <option key={code} value={name}>{name}{tier === 2 ? " · Beta" : ""}</option>)}
          </select>
        </label>
        <label className="rounded-lg border border-dashed border-white/20 p-5 text-sm text-zinc-300">
          <span className="block text-white">Upload PDF, DOCX, PPTX, video, or transcript</span>
          <input type="file" accept=".pdf,.txt,.md,.docx,.pptx,.mp4,.webm,.mov,.avi" className="mt-3 block max-w-full text-xs" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <div>
          <label className="text-sm text-zinc-300">Import YouTube captions</label>
          <div className="mt-3 flex gap-2">
            <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="YouTube URL" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 p-2 text-sm" />
            <button type="button" disabled={busy || !youtubeUrl.trim()} onClick={importYoutube} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm text-white disabled:opacity-50">Import</button>
          </div>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-zinc-300">{message}</p> : null}
      <div className="mt-6 flex items-center justify-between"><h2 className="text-lg font-medium">My materials ({lectures.length})</h2><Link href="/faculty/quiz-generator" className="rounded-lg border border-white/15 px-3 py-2 text-sm">Generate quiz</Link></div>
      {lectures.length === 0 ? <div className="mt-3"><EmptyState message="No materials uploaded yet." /></div> : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">{lectures.map((lecture) => (
          <article key={lecture._id} className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between">
            <div>
              <h3 className="font-medium text-white">{lecture.title}</h3>
              <p className="mt-1 text-xs text-zinc-400">{lecture.sourceType || "material"} · {lecture.status || "processed"}</p>
            </div>
            <div className="mt-4 flex gap-3 text-sm items-center">
              <Link href={`/player?lectureId=${lecture._id}`} className="text-cyan-300">Open player</Link>
              <Link href={`/quiz?lectureId=${lecture._id}`} className="text-cyan-300">Quiz</Link>
            </div>
            {courses.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                <select
                  value={selectedCourse[lecture._id] || ""}
                  onChange={(e) => setSelectedCourse({ ...selectedCourse, [lecture._id]: e.target.value })}
                  className="flex-1 rounded border border-white/10 bg-white/5 p-1 text-xs text-white"
                >
                  <option value="">Select Course...</option>
                  {courses.map(c => <option key={c.code} value={c.code}>{c.title}</option>)}
                </select>
                <button
                  onClick={() => attachToCourse(lecture._id)}
                  disabled={!selectedCourse[lecture._id] || attaching[lecture._id]}
                  className="rounded bg-zinc-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                >
                  {attaching[lecture._id] ? "Attaching..." : "Attach"}
                </button>
              </div>
            )}
          </article>
        ))}</div>
      )}
    </PageShell>
  );
}
