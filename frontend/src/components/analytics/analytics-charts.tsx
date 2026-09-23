"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#1463d8", "#14a06f", "#e46d38", "#8b5cf6", "#d97706", "#64748b", "#0891b2", "#be123c"];

export type AnalyticsChartProps = {
  data: any[];
  title: string;
  description?: string;
  emptyMessage?: string;
};

function ChartFrame({ title, description, children }: Omit<AnalyticsChartProps, "data"> & { children: React.ReactNode }) {
  return <div role="group" aria-label={title}>
    <h3 className="text-sm font-medium">{title}</h3>
    {description ? <p className="mt-1 text-xs text-zinc-400">{description}</p> : null}
    <div className="mt-3 h-64 w-full">{children}</div>
  </div>;
}

export function ChartEmpty({ title, message = "Insufficient data for this visualization." }: { title: string; message?: string }) {
  return <div role="status" aria-label={title} className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/15 px-4 text-center text-sm text-zinc-400">{message}</div>;
}

export function CompetencyDistributionChart({ data, title = "Competency distribution", description = "Persisted current proficiency levels." }: Omit<AnalyticsChartProps, "title"> & { title?: string }) {
  if (!data.length) return <ChartEmpty title={title} />;
  const chartData = data.map((item) => ({ name: `Level ${item.level}`, records: item.count }));
  return <ChartFrame title={title} description={description}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid,#b7c8d9)" /><XAxis dataKey="name" tick={{ fill: "var(--chart-text,#526274)", fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: "var(--chart-text,#526274)", fontSize: 11 }} /><Tooltip /><Bar dataKey="records" name="Records" fill="#1463d8" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame>;
}

export function CategoryBarChart({ data, title, description, nameKey, valueKey, valueLabel = "Count" }: AnalyticsChartProps & { nameKey: string; valueKey: string; valueLabel?: string }) {
  if (!data.length) return <ChartEmpty title={title} />;
  const chartData = data.map((item) => ({ name: String(item[nameKey] ?? "Unavailable"), value: Number(item[valueKey] ?? 0) }));
  return <ChartFrame title={title} description={description}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, bottom: 4, left: 24 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid,#b7c8d9)" /><XAxis type="number" allowDecimals={false} tick={{ fill: "var(--chart-text,#526274)", fontSize: 11 }} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: "var(--chart-text,#526274)", fontSize: 11 }} /><Tooltip /><Bar dataKey="value" name={valueLabel} fill="#14a06f" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></ChartFrame>;
}

export function SourceDonutChart({ data, title = "Learning source distribution", description = "Processed outcome source counts; provider labels remain descriptive." }: { data: any[]; title?: string; description?: string }) {
  if (!data.length) return <ChartEmpty title={title} />;
  const grouped = new Map<string, number>();
  for (const item of data) grouped.set(String(item.source || "Unavailable"), (grouped.get(String(item.source || "Unavailable")) || 0) + Number(item.count || 0));
  const chartData = [...grouped.entries()].map(([name, value]) => ({ name, value }));
  return <ChartFrame title={title} description={description}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="48%" outerRadius={82} label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`}>{chartData.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></ChartFrame>;
}

export function ImprovementChart({ improvement, title = "Evidence-aware improvement", description = "Observed classifications; completion alone is excluded from evidence-backed improvement." }: { improvement: any; title?: string; description?: string }) {
  const data = [
    { name: "Improved", value: improvement?.improved },
    { name: "Unchanged", value: improvement?.unchanged },
    { name: "Declined", value: improvement?.declined },
    { name: "Insufficient evidence", value: improvement?.insufficientEvidence }
  ].filter((item) => item.value !== undefined && item.value !== null).map((item) => ({ ...item, value: Number(item.value) }));
  if (!data.length) return <ChartEmpty title={title} />;
  return <ChartFrame title={title} description={description}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid,#b7c8d9)" /><XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" height={54} tick={{ fill: "var(--chart-text,#526274)", fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fill: "var(--chart-text,#526274)", fontSize: 11 }} /><Tooltip /><Bar dataKey="value" name="Competencies" fill="#e46d38" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame>;
}
