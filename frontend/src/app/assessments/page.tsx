"use client";
import { useEffect, useMemo, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, LoadingState, PageShell, ProgressBar, SectionCard, StatusBadge } from "@/components/sih/ui";
import { api } from "@/lib/api";
export default function AssessmentsPage() { return <RoleGate roles={["employee"]}><AssessmentsContent /></RoleGate>; }
function AssessmentsContent() {
  const [competencies, setCompetencies] = useState<any[]>([]); const [selected, setSelected] = useState<string[]>([]); const [session, setSession] = useState<any>(null); const [answers, setAnswers] = useState<Record<string, "A" | "B" | "C" | "D" | "">>({}); const [result, setResult] = useState<any>(null); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false); const [query, setQuery] = useState(""); const [domain, setDomain] = useState("all"); const [questionIndex, setQuestionIndex] = useState(0);
  useEffect(() => {
    api.get("/competencies").then((res) => setCompetencies(res.data.competencies || [])).catch(() => setCompetencies([]));
    api.get("/assessments/active").then((res) => {
      if (res.data.assessment) {
        const nextSession = normalizeSession(res.data);
        setSession(nextSession);
        if (nextSession.playable && nextSession.questions) {
          const init: Record<string, "A" | "B" | "C" | "D" | ""> = {};
          for (const q of nextSession.questions) init[q._id] = "";
          setAnswers(init);
        }
      }
    }).catch(console.error);
  }, []);

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]);
  }

  function normalizeSession(payload: any) {
    const assessment = payload?.assessment || {
      _id: payload?.assessmentId,
      id: payload?.assessmentId,
      status: payload?.status || "pending_review"
    };
    const status = payload?.status || assessment?.status || "pending_review";
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];
    return { ...payload, assessment, questions, status, playable: Boolean(payload?.playable ?? (status === "in_progress" && questions.length > 0)) };
  }

  async function start() {
    if (!selected.length) {
      setMessage("Select 1–3 competencies to begin.");
      return;
    }
    setLoading(true);
    setResult(null);
    setMessage("");
    try {
      const { data } = await api.post("/assessments/competency/start", { competencyIds: selected, countPerCompetency: 4 });
      const nextSession = normalizeSession(data);
      setSession(nextSession);
      const init: Record<string, "A" | "B" | "C" | "D" | ""> = {};
      for (const q of nextSession.questions || []) init[q._id] = "";
      setAnswers(init);
      setQuestionIndex(0);
      if (nextSession.status === "pending_review") {
        setMessage(nextSession.message || "This assessment is awaiting review before it becomes playable.");
      }
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Failed to start assessment (AI provider may be unavailable).");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    const assessmentId = session?.assessment?._id || session?.assessment?.id || session?.assessmentId;
    if (!assessmentId) {
      setMessage("No valid assessment is available to submit.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        answers: Object.entries(answers)
          .map(([questionId, selectedAns]) => ({ questionId, selected: selectedAns }))
          .filter((answer) => Boolean(answer.questionId) && answer.selected !== "")
      };
      const { data } = await api.post(`/assessments/competency/${assessmentId}/complete`, payload);
      setResult(data);
      setMessage("Assessment completed. Competency scores and skill gaps were recalculated from your answers.");
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Submit failed");
    } finally {
      setLoading(false);
    }
  }

  const domains = Array.from(new Set(competencies.map((c) => c.category || c.domain).filter(Boolean)));
  const filtered = competencies.filter(
    (c) => String(c.name || "").toLowerCase().includes(query.toLowerCase()) &&
      (domain === "all" || String(c.category || c.domain) === domain)
  );
  const questions = Array.isArray(session?.questions) ? session.questions : [];
  const status = session?.status || session?.assessment?.status || "pending_review";
  const isPlayable = status === "in_progress" && questions.length > 0;
  const currentQuestion = isPlayable ? questions[questionIndex] : undefined;

  if (session) {
    if (status === "pending_review") {
      return <PageShell title="Assessment pending review" subtitle="Your assessment is awaiting authorized faculty review before publication."><div className="assessment-layout"><SectionCard title="Assessment status" eyebrow="PENDING REVIEW"><p className="section-note">This assessment is not yet playable. Faculty review is required before publication.</p><div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-100">Your assessment is awaiting authorized faculty review and will become available after publication.</div></SectionCard></div></PageShell>;
    }

    if (!isPlayable) {
      return <PageShell title="Assessment unavailable" subtitle="This assessment is not currently playable."><div className="assessment-layout"><SectionCard title="Assessment unavailable" eyebrow="INVALID STATE"><p className="section-note">This assessment is currently unavailable or inconsistent. Please wait for the authorized review/finalization workflow to complete.</p></SectionCard></div></PageShell>;
    }

    return <PageShell title={session.quiz?.title || "Competency assessment"} subtitle="Work through each question at your own pace. Your answers are scored server-side." actions={<div className="assessment-progress-label"><span>Question {Math.min(questionIndex + 1, questions.length)} of {questions.length}</span><ProgressBar value={questionIndex + 1} target={questions.length || 1} /></div>}><div className="assessment-layout"><SectionCard title="Assessment attempt" eyebrow="IN PROGRESS"><div className="question-card"><div className="question-kicker"><span>QUESTION {String(questionIndex + 1).padStart(2, "0")} </span><StatusBadge status={answers[currentQuestion?._id] ? "answered" : "not answered"} /></div><h2>{currentQuestion?.question}</h2><div className="answer-list">{(["A", "B", "C", "D"] as const).map((opt) => <label className={`answer-option ${answers[currentQuestion?._id] === opt ? "selected" : ""}`} key={opt}><input type="radio" name={currentQuestion?._id} checked={answers[currentQuestion?._id] === opt} onChange={() => setAnswers({ ...answers, [currentQuestion._id]: opt })} /><span className="answer-letter">{opt}</span><span>{currentQuestion?.options?.[opt]}</span></label>)}</div></div><div className="assessment-controls"><button className="sih-button-secondary" disabled={questionIndex === 0} onClick={() => setQuestionIndex((i) => i - 1)}>← Previous</button>{questionIndex < questions.length - 1 ? <button className="sih-button-primary" onClick={() => setQuestionIndex((i) => i + 1)}>Next question →</button> : <button className="sih-button-primary" onClick={submit} disabled={loading}>{loading ? "Evaluating…" : "Submit assessment"}</button>}</div></SectionCard><aside className="assessment-side"><div className="assessment-side-card"><p className="eyebrow">PROGRESS</p><strong>{Object.values(answers).filter(Boolean).length}/{questions.length}</strong><span>questions answered</span><ProgressBar value={Object.values(answers).filter(Boolean).length} target={questions.length || 1} /><p className="mt-3 text-xs text-zinc-400">Status: {status}</p></div></aside></div></PageShell>;
  }

    return <PageShell title="Competency assessments" subtitle="Choose the capabilities you want to measure. Each assessment creates evidence for your competency profile." actions={<div className="selection-count"><strong>{selected.length}/3</strong><span>selected</span></div>}><div className="assessment-layout"><SectionCard title="Start an assessment" eyebrow="SELECT COMPETENCIES"><p className="section-note">Select up to three competencies. We’ll generate four questions per competency.</p><div className="filter-bar"><label className="search-field"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search competencies" aria-label="Search competencies" /></label><select className="sih-field" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Filter competencies"><option value="all">All domains</option>{domains.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>{competencies.length === 0 ? <EmptyState message="Competency framework not seeded yet. Start the backend once to seed." /> : <div className="assessment-competency-grid">{filtered.map((c) => <button type="button" key={c._id} className={`assessment-competency ${selected.includes(c._id) ? "selected" : ""}`} onClick={() => toggle(c._id)}><span className="selection-check">{selected.includes(c._id) ? "✓" : ""}</span><span><strong>{c.name}</strong><small>{c.category || c.domain || "Competency"}</small></span></button>)}{!filtered.length ? <EmptyState message="No competencies match your search." /> : null}</div>}</SectionCard><aside className="assessment-side"><div className="assessment-side-card"><p className="eyebrow">READY TO BEGIN?</p><strong>{selected.length ? `${selected.length} selected` : "Choose a focus"}</strong><span>Maximum 3 competencies</span><ProgressBar value={selected.length} target={3} /><button onClick={start} disabled={loading || !selected.length} className="sih-button-primary mt-4 w-full">{loading ? "Generating…" : "Start assessment →"}</button></div><div className="assessment-note"><strong>What happens next?</strong><p>Your answers are scored using the existing ARAMBH competency bands and will update your evidence and skill-gap analysis.</p></div></aside></div>{message ? <p className="feedback-message">{message}</p> : null}</PageShell>;
}

