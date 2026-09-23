"use client";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, Journey, LoadingState, PageShell, ProgressBar, SectionCard, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";
const EXTERNAL_PORTALS: Record<string, string> = { igot: "https://portal.igotkarmayogi.gov.in", nssta: "https://nssta.gov.in/" };
export default function LearningPathPage() { return <RoleGate roles={["employee"]}><LearningPathContent /></RoleGate>; }
function LearningPathContent() {
  const [items, setItems] = useState<any[]>([]); const [message, setMessage] = useState<string>(); const [adaptive, setAdaptive] = useState<any>(null); const [loading, setLoading] = useState(true); const [tab, setTab] = useState("all");
  async function load() { setLoading(true); try { const [pathResponse, adaptiveResponse] = await Promise.all([api.get("/learning-path/me"), api.get("/adaptive-learning/next").catch(() => ({ data: null }))]); setItems(pathResponse.data.recommendations || []); setMessage(pathResponse.data.message); setAdaptive(adaptiveResponse.data); } finally { setLoading(false); } } useEffect(() => { load(); }, []);
  async function refresh() { setLoading(true); try { const { data } = await api.post("/learning-path/refresh"); setItems(data.recommendations || []); setMessage(undefined); } finally { setLoading(false); } }
  
  async function enroll(r: any) {
    if (r.demoResource) {
      alert("Provider integration unavailable — configuration required. This is a demo resource.");
      return;
    }
    setLoading(true);
    try {
      if (r.source === "igot") {
        await api.post("/igot/enrollments", { courseId: r.externalId, title: r.title });
      } else if (r.source === "nssta") {
        await api.post("/nssta/enrollments", { programmeId: r.externalId, title: r.title });
      }
      await load();
    } catch (e: any) {
      alert(e.response?.data?.message || "Enrollment failed. Provider credentials/endpoint verification required.");
    } finally {
      setLoading(false);
    }
  }

  async function markComplete(r: any) {
    if (r.demoResource) return;
    setLoading(true);
    try {
      if (r.source === "igot") {
        await api.patch(`/igot/enrollments/${r.externalId}`, { progressPercent: 100, status: "completed" });
      } else if (r.source === "nssta") {
        await api.patch(`/nssta/enrollments/${r.externalId}`, { progressPercent: 100, status: "completed" });
      }
      await load();
      alert("SELF-ATTESTED COMPLETION — NOT PROVIDER-VERIFIED.");
    } catch (e: any) {
      alert(e.response?.data?.message || "Completion sync failed.");
    } finally {
      setLoading(false);
    }
  }
  const tabs = [{ id: "all", label: "All", count: items.length }, ...["recommended", "enrolled", "in_progress", "completed"].map((id) => ({ id, label: id.replace("_", " "), count: items.filter((r) => (r.status || "recommended") === id).length }))]; const visible = tab === "all" ? items : items.filter((r) => (r.status || "recommended") === tab); const hasDemoResources = items.some((r) => r.demoResource);
  return <PageShell title={hasDemoResources ? "Demo learning catalog" : "Personalized learning path"} subtitle={hasDemoResources ? "Explore ARAMBH demo learning resources while personalized recommendations are unavailable." : "A practical route from your current skill gaps to stronger demonstrated capability."} actions={<button onClick={refresh} className="sih-button-primary" disabled={loading}>Refresh path</button>}>
    <div className="path-overview"><div><p className="eyebrow">{hasDemoResources ? "ARAMBH DEMO CATALOG" : "YOUR NEXT BEST ACTION"}</p><h2>{hasDemoResources ? "Explore learning content." : "Learn with purpose."}</h2><p>{hasDemoResources ? "These resources are context-only demonstrations, not personalized recommendations or competency evidence." : "Every recommendation is connected to a competency need and the evidence available in your profile."}</p></div><div className="path-overview-stat"><strong>{items.filter((r) => r.status === "completed").length}</strong><span>completed recommendations</span></div></div>
    {adaptive ? <SectionCard title="Adaptive next action" eyebrow="EVIDENCE-LED GUIDANCE" className="mt-5"><div className="path-overview"><div><h2>{adaptive.decision === "challenge" ? "Take an advanced challenge." : adaptive.decision === "progress" ? "Progress to the next level." : adaptive.decision === "practice" ? "Practice the fundamentals." : adaptive.decision === "review" ? "Review before progressing." : "Continue your learning."}</h2><p>{adaptive.reasonSummary}</p></div><div className="path-overview-stat"><strong>{String(adaptive.performanceBand || "insufficient_evidence").replace(/_/g, " ")}</strong><span>{adaptive.recommendedDifficulty ? `${adaptive.recommendedDifficulty} difficulty` : "Safe fallback"}</span></div></div>{adaptive.resource ? <div className="path-card-footer mt-4"><span>{adaptive.resource.title} · {adaptive.confidence} confidence</span>{adaptive.resource.courseUrl ? <a href={adaptive.resource.courseUrl} className="sih-button-secondary">Open next action →</a> : null}</div> : null}</SectionCard> : null}
    <SectionCard title="Learning journey" eyebrow="FROM GAP TO IMPROVEMENT" className="mt-5"><Journey steps={[{ label: "Gap", detail: "Identify the capability to build", active: items.length > 0 }, { label: "Recommended", detail: `${items.filter((r) => !r.status || r.status === "recommended").length} options selected`, active: items.length > 0 }, { label: "Enrolled", detail: "Commit to a learning action", active: items.some((r) => ["enrolled", "in_progress", "completed"].includes(r.status)) }, { label: "In progress", detail: "Apply and practise", active: items.some((r) => ["in_progress", "completed"].includes(r.status)) }, { label: "Completed", detail: "Record improvement", active: items.some((r) => r.status === "completed") }]} /></SectionCard>
    <SectionCard title={hasDemoResources ? "Demo learning resources" : "Recommendations"} eyebrow={hasDemoResources ? "CONTEXT-ONLY CONTENT" : "EXPLAINABLE LEARNING OPTIONS"} className="mt-5"><div className="path-tabs" role="tablist">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)} role="tab" aria-selected={tab === item.id}>{item.label}<span>{item.count}</span></button>)}</div>{loading ? <LoadingState /> : !visible.length ? <EmptyState message={message || "No personalized learning recommendations are available in this view. Complete or update your competency assessment to generate a personalized learning path."} /> : <div className="path-list">{visible.map((r) => { const isValidPlatformCourse = r.source === "platform" && typeof r.externalId === "string" && r.externalId.trim().length > 0 && !/^PATH_/i.test(r.externalId.trim()) && Boolean(r.courseUrl); const providerHref = r.source === "igot" ? EXTERNAL_PORTALS.igot : r.source === "nssta" ? EXTERNAL_PORTALS.nssta : null; return <article className="path-card" key={r._id}><div className="path-card-step"><span>{String(r.pathStep || "—").padStart(2, "0")}</span><i aria-hidden="true" /></div><div className="path-card-content"><div className="recommendation-card-top"><span className="source-label">{r.demoResource ? "ARAMBH Demo / Context Only" : r.source || r.provider || "ARAMBH"}</span><StatusBadge status={r.status || "recommended"} /></div><div className="path-card-title"><div><h3>{r.title}</h3><p>{r.description || "Learning resource selected for your development path."}</p>{r.demoResource ? <p className="text-sm text-amber-300">Context-only resource; no personalized gap or competency evidence is implied.</p> : null}</div><strong>{r.relevanceScore != null ? `${r.relevanceScore} relevance` : ""}</strong></div><div className="path-card-grid"><div><span>{r.demoResource ? "Catalog context" : "Why recommended"}</span><b>{r.reasonSummary || r.whyRecommended || (r.demoResource ? "Available for local demonstration." : "Matches a recorded competency gap.")}</b></div><div><span>Competency / gap</span><b>{r.demoResource ? "Not personalized" : r.gapSolved || r.matchedCompetencies?.join(", ") || "Capability building"}</b></div><div><span>Evidence confidence</span><b>{r.demoResource ? "Context only" : r.confidence || "low"}</b></div><div><span>Personalization</span><b>{r.demoResource ? "None claimed" : r.reasonCodes?.join(" · ") || r.personalizationFactors?.join(" · ") || "Role and gap relevance"}</b></div></div>{r.progressPercent != null ? <div className="path-progress"><div><span>Progress</span><b>{r.progressPercent}%</b></div><ProgressBar value={r.progressPercent} /></div> : null}<div className="path-card-footer"><span>{r.durationHours ? `${r.durationHours} hours` : "Duration not specified"}</span>{isValidPlatformCourse ? <>{r.hasLectures && r.firstLectureId ? <a href={`/player?lectureId=${r.firstLectureId}`} className="sih-button-primary">{r.learningProgressStatus === "in_progress" || r.learningProgressStatus === "completed" ? "Continue Learning" : "Start Learning"}</a> : <span className="text-sm text-zinc-400 font-semibold px-2">Lectures not available yet</span>}<a href={r.courseUrl} className="sih-button-secondary" aria-label={`View course: ${r.title}`}>View Course</a></> : r.source === "platform" ? <span className="text-sm text-amber-300">Course unavailable</span> : (r.source === "igot" || r.source === "nssta") ? (r.status === "enrolled" || r.status === "in_progress" ? <><a href={providerHref || r.courseUrl || "#"} target="_blank" rel="noreferrer" className="sih-button-secondary">Continue on provider ↗</a><button onClick={() => markComplete(r)} className="sih-button-primary">Self-Attest Completion</button></> : r.status === "completed" ? <span className="text-sm text-green-600 font-semibold">Completed (Self-Attested)</span> : <button onClick={() => enroll(r)} className="sih-button-primary">Enroll Now</button>) : r.courseUrl ? <a href={r.courseUrl} className="sih-button-secondary">Open resource</a> : null}</div></div></article>; })}</div>}</SectionCard>
  </PageShell>;
}
