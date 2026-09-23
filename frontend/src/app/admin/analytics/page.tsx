"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, LoadingState, MetricCard, PageShell, SectionCard, StatusBadge } from "@/components/sih/ui";
import { CategoryBarChart, CompetencyDistributionChart, ImprovementChart, SourceDonutChart } from "@/components/analytics/analytics-charts";
import { api } from "@/lib/api";

type AnalyticsData = any;

const EMPTY: AnalyticsData = {
  summary: {},
  learning: { activityByType: [], progressByStatus: [], recommendationsByStatus: [] },
  competency: { levelDistribution: [], competencyDistribution: [], improvement: {} },
  skillGaps: { distribution: [], historicalMovement: { status: "unavailable" } },
  sources: [],
  breakdowns: { departments: [], roles: [] },
  context: { departments: [], roleRequirements: [] },
  limitations: []
};

function value(value: unknown, suffix = "") {
  return value === null || value === undefined ? "N/A" : `${value}${suffix}`;
}

function dateParam(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : undefined;
}

function Bars({ items, label, valueKey = "count" }: { items: any[]; label: (item: any) => string; valueKey?: string }) {
  if (!items.length) return <p className="text-sm text-zinc-400">Insufficient data for this view.</p>;
  const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
  return <div className="space-y-3">{items.slice(0, 8).map((item, index) => {
    const amount = Number(item[valueKey] || 0);
    return <div key={`${label(item)}-${index}`}>
      <div className="flex justify-between gap-3 text-sm"><span className="truncate">{label(item)}</span><span className="text-zinc-400">{amount}</span></div>
      <div className="mt-1 h-2 rounded-full bg-white/10" role="progressbar" aria-label={label(item)} aria-valuenow={amount} aria-valuemin={0} aria-valuemax={max}>
        <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${Math.max(2, Math.round((amount / max) * 100))}%` }} />
      </div>
    </div>;
  })}</div>;
}

function SummaryCards({ summary }: { summary: any }) {
  const cards = [
    ["Employees / learners", value(summary.learnerCount), "Persisted employee scope", "blue"],
    ["Active learners", value(summary.activeLearnerCount), "Activity in selected range", "green"],
    ["Learning hours", value(summary.totalLearningHours), "Recorded activity duration", "purple"],
    ["Activities", value(summary.totalLearningActivities), "Engagement signals", "orange"],
    ["Completions", value(summary.completedLearningItems), "Progress records completed", "blue"],
    ["Quiz attempts", value(summary.quizAttempts), value(summary.quizPassRate, "% pass rate"), "green"],
    ["Assessments", value(summary.assessmentParticipation), "Participation records", "purple"],
    ["Validated outcomes", value(summary.validatedLearningOutcomes), "Processed canonical outcomes", "orange"],
    ["High / critical gaps", value(summary.highCriticalSkillGapCount), "Current persisted gaps", "red"],
    ["Evidence-backed improvement", value(summary.evidenceBackedImprovement), "Observed, not causal", "green"]
  ];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([label, metric, hint, tone]) => <MetricCard key={label} label={label} value={metric} hint={hint} tone={tone} />)}</div>;
}

function Filters({ filters, setFilters, onApply, loading }: { filters: any; setFilters: (next: any) => void; onApply: () => void; loading: boolean }) {
  return <section className="section-card mb-6">
    <div className="section-card-heading"><p className="eyebrow">Bounded analytics query</p><div className="section-card-title"><h2>Filters</h2><span className="text-xs text-zinc-400">Maximum range: 365 days</span></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <label className="text-sm">From<input aria-label="Analytics from date" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2" /></label>
      <label className="text-sm">To<input aria-label="Analytics to date" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2" /></label>
      <label className="text-sm">Department<select aria-label="Analytics department" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2"><option value="">All departments</option>{filters.departments.map((item: any) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
      <label className="text-sm">Role<select aria-label="Analytics role" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2"><option value="">All roles</option>{filters.roles.map((item: any) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
      <label className="text-sm">Source<select aria-label="Analytics source" value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2"><option value="">All sources</option>{["platform", "igot", "nssta", "training", "quiz", "assessment", "virtual_lab"].map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></label>
      <label className="text-sm">Status<select aria-label="Analytics status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2"><option value="">All statuses</option>{["completed", "in_progress", "passed", "failed"].map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></label>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={onApply} disabled={loading} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loading ? "Loading…" : "Apply filters"}</button><span className="text-xs text-zinc-400">All values are descriptive persisted records; missing evidence is not converted to zero.</span></div>
  </section>;
}

function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData>(EMPTY);
  const [filters, setFilters] = useState<any>({ from: "", to: "", department: "", role: "", source: "", status: "", departments: [], roles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = useMemo(() => Object.fromEntries(Object.entries({
    from: dateParam(filters.from),
    to: dateParam(filters.to),
    department: filters.department || undefined,
    role: filters.role || undefined,
    source: filters.source || undefined,
    status: filters.status || undefined,
    limit: 50
  }).filter(([, item]) => item !== undefined)), [filters]);

  async function load(nextParams = params) {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/analytics/organization", { params: nextParams });
      const result = response.data || EMPTY;
      setData(result);
      setFilters((current: any) => ({
        ...current,
        departments: current.departments.length ? current.departments : result.breakdowns?.departments || [],
        roles: current.roles.length ? current.roles : result.breakdowns?.roles || []
      }));
    } catch (requestError: any) {
      setError(requestError?.response?.status === 403 ? "You are not authorized to view organization analytics." : requestError?.response?.data?.message || "Could not load organization analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  if (loading && !data.summary.learnerCount) return <LoadingState label="Loading organization analytics…" />;
  if (error && !data.summary.learnerCount) return <EmptyState message={error} action={<button type="button" onClick={() => void load()} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">Retry</button>} />;

  const improvement = data.competency?.improvement || {};
  const learning = data.learning || EMPTY.learning;
  return <div>
    <Filters filters={filters} setFilters={setFilters} onApply={() => void load()} loading={loading} />
    {error ? <p role="alert" className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{error}</p> : null}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Organization overview</p><p className="text-sm text-zinc-400">{data.range?.from ? `${new Date(data.range.from).toLocaleDateString()} – ${new Date(data.range.to).toLocaleDateString()}` : "Latest available bounded range"}</p></div><Link href="/admin/dashboard" className="rounded-lg border border-white/15 px-4 py-2 text-sm">Open admin workspace</Link></div>
    <SummaryCards summary={data.summary} />

    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <SectionCard title="Competency and evidence charts" eyebrow="Decision support"><div className="grid gap-6 xl:grid-cols-2"><CompetencyDistributionChart data={data.competency?.levelDistribution || []} /><ImprovementChart improvement={improvement} /></div><details className="mt-4"><summary className="cursor-pointer text-xs text-zinc-400">Show exact competency classification values</summary><div className="mt-3"><Bars items={[{ name: "Improved", count: improvement.improved }, { name: "Unchanged", count: improvement.unchanged }, { name: "Declined", count: improvement.declined }, { name: "Insufficient evidence", count: improvement.insufficientEvidence }]} label={(item) => item.name} /></div></details></SectionCard>
      <SectionCard title="Skill-gap priority" eyebrow="Where training attention may be needed"><CategoryBarChart data={(data.skillGaps?.distribution || []).map((item: any) => ({ name: `${item.competencyId || "Unmapped"} · ${item.priority || "unknown"}`, count: item.learnerCount }))} title="Top persisted gaps" description="Current gap records only; historical movement is not fabricated." nameKey="name" valueKey="count" valueLabel="Learners" /><p className="mt-3 text-xs text-zinc-400">{data.skillGaps?.historicalMovement?.reason || "Historical skill-gap movement unavailable."}</p></SectionCard>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <SectionCard title="Department comparison" eyebrow="Persisted employee profile dimensions"><CategoryBarChart data={data.breakdowns?.departments || []} title="Learners by department" description="Aggregate learner population; no employee identifiers are exposed." nameKey="name" valueKey="learnerCount" valueLabel="Learners" /></SectionCard>
      <SectionCard title="Role comparison" eyebrow="Persisted job-role dimensions"><CategoryBarChart data={data.breakdowns?.roles || []} title="Learners by role" description="Aggregate role population; role requirements remain contextual." nameKey="name" valueKey="learnerCount" valueLabel="Learners" /></SectionCard>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <SectionCard title="Learning source distribution" eyebrow="Usage, not competency"><SourceDonutChart data={data.sources || []} /></SectionCard>
      <SectionCard title="Historical trends" eyebrow="Honest data state"><div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/15 px-6 text-center text-sm text-zinc-400">Historical learning and skill-gap time-series are unavailable because the current aggregate contract does not persist a time-series projection. No synthetic trend is shown.</div></SectionCard>
    </div>

    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <SectionCard title="Competency intelligence" eyebrow="Observed state and evidence"><div className="grid gap-5 md:grid-cols-2"><div><h3 className="mb-3 text-sm font-medium">Proficiency distribution</h3><Bars items={data.competency?.levelDistribution || []} label={(item) => `Level ${item.level} / 5`} valueKey="count" /></div><div><h3 className="mb-3 text-sm font-medium">Improvement classification</h3><Bars items={[{ name: "Improved", count: improvement.improved }, { name: "Unchanged", count: improvement.unchanged }, { name: "Declined", count: improvement.declined }, { name: "Insufficient evidence", count: improvement.insufficientEvidence }]} label={(item) => item.name} /></div></div><p className="mt-4 text-xs text-zinc-400">Evidence-backed improvement: {value(improvement.evidenceBackedImprovement)}. Catalog, recommendation, and completion mappings are contextual only.</p></SectionCard>
      <SectionCard title="Skill-gap intelligence" eyebrow="Current persisted gaps"><Bars items={(data.skillGaps?.distribution || []).map((item: any) => ({ ...item, count: item.learnerCount }))} label={(item) => `${item.competencyId || "Unmapped competency"} · ${item.priority || "unknown"}`} valueKey="count" /><p className="mt-4 text-xs text-zinc-400">{data.skillGaps?.historicalMovement?.reason || "Historical movement unavailable."}</p></SectionCard>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <SectionCard title="Learning and engagement" eyebrow="Activity is not competency"><div className="grid gap-5 md:grid-cols-2"><div><h3 className="mb-3 text-sm font-medium">Activity by type</h3><Bars items={learning.activityByType || []} label={(item) => item.type} valueKey="count" /></div><div><h3 className="mb-3 text-sm font-medium">Progress by status</h3><Bars items={learning.progressByStatus || []} label={(item) => `${item.resourceType} · ${item.status}`} valueKey="count" /></div></div></SectionCard>
      <SectionCard title="Assessment and performance" eyebrow="Measured learning results"><div className="grid gap-3 sm:grid-cols-2"><MetricCard label="Quiz average" value={value(data.summary.quizAverageScore, "%")} hint={value(data.summary.quizAttempts, " attempts")} tone="blue" /><MetricCard label="Quiz pass rate" value={value(data.summary.quizPassRate, "%")} hint="Persisted quiz results" tone="green" /><MetricCard label="Lab attempts" value={value(data.summary.virtualLabAttempts)} hint={value(data.summary.virtualLabPassRate, "% pass rate")} tone="purple" /><MetricCard label="Assessment participation" value={value(data.summary.assessmentParticipation)} hint="Completed assessment records" tone="orange" /></div></SectionCard>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <SectionCard title="Departments" eyebrow="Organization comparison"><div className="space-y-2">{(data.breakdowns?.departments || []).length ? data.breakdowns.departments.slice(0, 10).map((item: any) => <div key={item.name} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"><span>{item.name}</span><span className="text-zinc-400">{item.learnerCount} learners</span></div>) : <p className="text-sm text-zinc-400">No department profile data available.</p>}</div></SectionCard>
      <SectionCard title="Roles" eyebrow="Role population"><div className="space-y-2">{(data.breakdowns?.roles || []).length ? data.breakdowns.roles.slice(0, 10).map((item: any) => <div key={item.name} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"><span>{item.name}</span><span className="text-zinc-400">{item.learnerCount} learners</span></div>) : <p className="text-sm text-zinc-400">No role profile data available.</p>}</div></SectionCard>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <SectionCard title="Learning sources" eyebrow="Provider metadata"><div className="space-y-2">{(data.sources || []).length ? data.sources.slice(0, 10).map((item: any, index: number) => <div key={`${item.source}-${item.eventType}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"><span>{item.source || "unknown"} · {item.eventType || "learning"}</span><span className="flex items-center gap-2"><StatusBadge status={item.providerStatus} />{item.count}</span></div>) : <p className="text-sm text-zinc-400">No validated source records in this range.</p>}</div></SectionCard>
      <SectionCard title="Evidence and data quality" eyebrow="Interpretation"><div className="space-y-3 text-sm"><p><strong>{value(data.summary.validatedLearningOutcomes)}</strong> processed learning outcomes recorded.</p><p><strong>{value(data.summary.evidenceBackedImprovement)}</strong> competency changes have supported persisted evidence.</p><p><strong>{value(data.summary.insufficientCompetencyEvidence)}</strong> competency records lack sufficient evidence for stronger interpretation.</p><p className="text-zinc-400">Completion, engagement, assessment performance, and competency evidence are separate measures.</p>{(data.limitations || []).slice(0, 5).map((item: string) => <p key={item} className="text-xs text-zinc-400">{item}</p>)}</div></SectionCard>
    </div>
  </div>;
}

export default function AdminAnalyticsPage() {
  return <RoleGate roles={["admin"]}><PageShell title="Admin Analytics" subtitle="Evidence-aware organization, department, and role decision support."><AdminAnalytics /></PageShell></RoleGate>;
}
