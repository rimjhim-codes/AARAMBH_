"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, LoadingState, PageShell, SectionCard, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";

const filters = [["", "All"], ["platform", "Courses"], ["quiz", "Quizzes"], ["assessment", "Assessments"], ["virtual_lab", "Labs"], ["training", "Training"], ["igot", "iGOT"], ["nssta", "NSSTA"]] as const;
type HistoryItem = { id: string; source: string; title: string; status: string; progress?: number; score?: number; occurredAt?: string; durationMinutes?: number; outcome?: string; competencyImpact?: Array<{ name?: string; code?: string }>; personalization?: { adaptiveAction?: string; performanceBand?: string }; metadata?: { attemptNumber?: number; feedback?: string } };

function displaySource(source: string) { return source === "virtual_lab" ? "Virtual Lab" : source === "learning_outcome" ? "Learning outcome" : source === "igot" ? "iGOT" : source === "nssta" ? "NSSTA/TPAC" : source.replace(/_/g, " "); }

function HistoryContent() {
  const [items, setItems] = useState<HistoryItem[]>([]); const [source, setSource] = useState(""); const [page, setPage] = useState(1); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState("");
  async function load(nextPage = 1, nextSource = source) {
    if (nextPage === 1) setLoading(true); else setLoadingMore(true); setError("");
    try { const response = await api.get("/learning-history", { params: { page: nextPage, limit: 20, ...(nextSource ? { source: nextSource } : {}) } }); const nextItems = response.data.items || []; setItems((current) => nextPage === 1 ? nextItems : [...current, ...nextItems]); setPage(nextPage); setHasMore(Boolean(response.data.pagination?.hasMore)); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || "Could not load your learning history."); }
    finally { setLoading(false); setLoadingMore(false); }
  }
  useEffect(() => { void load(1, source); }, [source]);
  if (loading) return <PageShell title="Learning history"><LoadingState /></PageShell>;
  if (error && !items.length) return <PageShell title="Learning history"><EmptyState message={error} /></PageShell>;
  return <PageShell title="Learning history" subtitle="A unified, read-only view across your courses, practice, assessments, outcomes, and provider records.">
    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Learning history filters">{filters.map(([value, label]) => <button key={value} type="button" onClick={() => setSource(value)} className={`rounded-full border px-3 py-1.5 text-xs ${source === value ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-white/10 text-zinc-400 hover:text-white"}`}>{label}</button>)}</div>
    {error ? <p className="mb-4 text-sm text-amber-300">{error}</p> : null}
    <SectionCard title="Learning timeline" eyebrow="YOUR ACTIVITY">{items.length ? <div className="history-timeline">{items.map((item) => <article className="history-item" key={item.id}><span className="history-marker" /><div className="history-item-main"><div className="history-item-head"><div><span className="source-label">{displaySource(item.source)}{item.metadata?.attemptNumber ? ` · Attempt ${item.metadata.attemptNumber}` : ""}</span><h3>{item.title}</h3></div><StatusBadge status={item.status} /></div><div className="history-item-meta"><span>{item.occurredAt ? new Date(item.occurredAt).toLocaleDateString() : "Date unavailable"}</span>{item.progress != null ? <span>{item.progress}% progress</span> : null}{item.score != null ? <span>Score {item.score}%</span> : null}{item.durationMinutes ? <span>{item.durationMinutes} min</span> : null}</div>{item.outcome ? <p className="mt-2 text-xs text-zinc-400">{item.outcome}</p> : null}{item.personalization?.adaptiveAction ? <p className="mt-2 text-xs text-cyan-200">Next learning action updated: {item.personalization.adaptiveAction.replace(/_/g, " ")}</p> : null}{item.metadata?.feedback ? <p className="mt-2 text-xs text-zinc-400">Feedback: {item.metadata.feedback}</p> : null}{item.competencyImpact?.length ? <p className="mt-2 text-xs text-cyan-200">Competency: {item.competencyImpact.map((impact) => impact.name || impact.code).filter(Boolean).join(", ")}</p> : null}</div></article>)}</div> : <EmptyState message="No learning activity has been recorded for this filter yet." />}</SectionCard>
    {hasMore ? <button type="button" onClick={() => void load(page + 1)} disabled={loadingMore} className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-sm text-white disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button> : null}
  </PageShell>;
}

export default function LearningHistoryPage() { return <RoleGate roles={["employee"]}><HistoryContent /></RoleGate>; }
