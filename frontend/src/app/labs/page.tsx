"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

function LabDetails({ lab }: { lab: any }) {
  return <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 lg:col-span-2">
    {lab.learningObjectives?.length ? <div><h3 className="text-sm font-medium text-white">Learning objectives</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">{lab.learningObjectives.map((item: string) => <li key={item}>{item}</li>)}</ul></div> : null}
    {lab.scenario && <p className="text-sm leading-6 text-zinc-300"><span className="font-medium text-white">Scenario:</span> {lab.scenario}</p>}
    {lab.task && <p className="text-sm leading-6 text-zinc-300"><span className="font-medium text-white">Task:</span> {lab.task}</p>}
    {lab.expectedOutcome && <p className="text-sm leading-6 text-zinc-300"><span className="font-medium text-white">Expected outcome:</span> {lab.expectedOutcome}</p>}
    {lab.hints?.length ? <div><h3 className="text-sm font-medium text-white">Hints</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">{lab.hints.map((item: string) => <li key={item}>{item}</li>)}</ul></div> : null}
    {lab.validationCriteria?.length ? <div><h3 className="text-sm font-medium text-white">Validation criteria</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">{lab.validationCriteria.map((item: string) => <li key={item}>{item}</li>)}</ul></div> : null}
    <div><h3 className="text-sm font-medium text-white">Attempt history</h3>{lab.attempts?.length ? <ul className="mt-2 space-y-1 text-xs text-zinc-400">{lab.attempts.map((attempt: any) => <li key={attempt._id}>Attempt {attempt.attemptNumber}: {attempt.status}{attempt.score ? ` · ${attempt.score}%` : ""}{attempt.feedback ? ` · ${attempt.feedback}` : ""}</li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No attempts yet.</p>}</div>
  </div>;
}

function LabsContent() {
  const [labs, setLabs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [code, setCode] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function loadLabs() {
    const { data } = await api.get("/labs");
    setLabs(data.labs || []);
  }

  useEffect(() => { loadLabs().catch(() => setError("Could not load virtual labs.")).finally(() => setLoading(false)); }, []);

  async function openLab(lab: any) {
    setSelected(lab);
    setCode(lab.starterCode || "");
    setAnswers({});
    setResult(null);
    try {
      const { data } = await api.post(`/labs/${lab.id}/start`);
      setSelected((current: any) => ({ ...current, ...data.lab, progress: data.progress, activeAttempt: data.attempt }));
    } catch (error: any) {
      setError(error?.response?.data?.message || "Could not start lab.");
    }
  }

  async function submit() {
    if (!selected) return;
    setRunning(true); setResult(null);
    try {
      const { data } = await api.post(`/labs/${selected.id}/submit`, selected.type === "code" ? { code } : { answers });
      setResult(data);
      if (data.attempt) setSelected((current: any) => ({ ...current, completion: data.completion || current.completion, progress: data.progress || current.progress, attempts: [data.attempt, ...(current.attempts || []).filter((attempt: any) => attempt._id !== data.attempt._id)] }));
      if (data.passed) await loadLabs();
    } catch (err: any) {
      setResult({ passed: false, feedback: err?.response?.data?.message || "Lab submission failed." });
    } finally { setRunning(false); }
  }

  if (loading) return <PageShell title="Virtual Labs" subtitle="Loading labs…" />;
  if (error) return <PageShell title="Virtual Labs"><EmptyState message={error} /></PageShell>;

  return <PageShell title="Virtual Labs" subtitle="Short, competency-linked practice with real validation and recorded completion. Cloud activities are simulations, not live cloud environments.">
    {selected && <div className="mb-4 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3 text-sm text-cyan-100">{selected.category || selected.competency} · {selected.difficulty} · {selected.minutes} min · Progress {selected.progress?.progressPercent || 1}%</div>}
    {!selected ? <>
      <div className="mb-6 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4 text-sm leading-6 text-zinc-300">These first labs use constrained validation and guided scenarios. The Python-style lab checks the submitted transformation and expected result; it does not execute arbitrary code on the platform.</div>
      {labs.length === 0 ? <EmptyState message="No virtual labs are configured yet." /> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{labs.map((lab) => <button type="button" key={lab.id} onClick={() => openLab(lab)} className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-cyan-400/5"><div className="flex items-center justify-between gap-3"><span className="rounded-full border border-cyan-400/20 px-2 py-1 text-xs text-cyan-200">{lab.competency}</span><span className="text-xs text-zinc-500">{lab.minutes} min</span></div><h2 className="mt-8 text-lg font-semibold text-white">{lab.title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">{lab.description}</p><div className="mt-5 flex items-center justify-between text-xs"><span className="text-zinc-500">{lab.type === "code" ? "Code validation" : "Guided scenario"} · {lab.difficulty}</span><span className={lab.completion ? "text-emerald-300" : "text-cyan-300"}>{lab.completion ? "Completed ✓" : "Start lab →"}</span></div></button>)}</div>}
    </> : <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><LabDetails lab={selected} />
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><button type="button" onClick={() => setSelected(null)} className="text-sm text-cyan-300">← All labs</button><div className="mt-6 flex items-center justify-between gap-3"><span className="rounded-full border border-cyan-400/20 px-2 py-1 text-xs text-cyan-200">{selected.competency}</span><span className="text-xs text-zinc-500">{selected.difficulty} · {selected.minutes} min</span></div><h2 className="mt-4 text-2xl font-semibold text-white">{selected.title}</h2><p className="mt-3 text-sm leading-6 text-zinc-300">{selected.description}</p><ol className="mt-6 space-y-4">{selected.instructions.map((instruction: string, index: number) => <li key={instruction} className="flex gap-3 text-sm text-zinc-400"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-xs text-cyan-200">{index + 1}</span>{instruction}</li>)}</ol></section>
      <section className="rounded-2xl border border-white/10 bg-[#071426] p-5">{selected.type === "code" ? <><div className="flex items-center justify-between"><div><h3 className="font-medium text-white">Constrained code validator</h3><p className="mt-1 text-xs text-zinc-500">Use the starter and satisfy every required check.</p></div><span className="rounded border border-amber-400/20 px-2 py-1 text-xs text-amber-200">No arbitrary execution</span></div><textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} className="mt-5 min-h-80 w-full rounded-xl border border-white/10 bg-[#030914] p-4 font-mono text-sm leading-6 text-cyan-100 outline-none focus:border-cyan-400/50" aria-label="Lab code" /><div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-400">Expected result: <code className="text-cyan-200">{selected.expectedOutput}</code></div></> : <><h3 className="font-medium text-white">Scenario checkpoints</h3><div className="mt-5 space-y-5">{selected.checkpoints.map((checkpoint: any, index: number) => <fieldset key={checkpoint.id}><legend className="text-sm leading-6 text-zinc-200">{index + 1}. {checkpoint.prompt}</legend><div className="mt-2 grid gap-2">{checkpoint.options.map((option: string) => <label key={option} className="flex cursor-pointer gap-2 rounded-lg border border-white/10 p-3 text-sm text-zinc-400 hover:border-cyan-400/30"><input type="radio" name={checkpoint.id} checked={answers[checkpoint.id] === option} onChange={() => setAnswers((current) => ({ ...current, [checkpoint.id]: option }))} />{option}</label>)}</div></fieldset>)}</div></>}
        {result ? <div className={`mt-5 rounded-xl border p-4 text-sm ${result.passed ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}><p className="font-medium">{result.passed ? "Lab completed" : "Keep working"}</p><p className="mt-1">{result.feedback}</p></div> : null}<button type="button" disabled={running || Boolean(selected.completion)} onClick={submit} className="mt-5 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{selected.completion ? "Completed" : running ? "Validating…" : "Run validation"}</button>
      </section>
    </div>}
  </PageShell>;
}

export default function VirtualLabsPage() { return <RoleGate roles={["employee", "faculty", "admin"]}><LabsContent /></RoleGate>; }
