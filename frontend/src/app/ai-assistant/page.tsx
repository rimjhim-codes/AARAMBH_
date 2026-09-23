"use client";
import { FormEvent, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, LoadingState, PageShell, SectionCard } from "@/components/sih/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/useAuth";
export default function AiAssistantPage() { return <RoleGate roles={["employee", "faculty", "admin"]}><AssistantContent /></RoleGate>; }
function AssistantContent() {
  const { user } = useAuth();
  const role = user?.role || "employee";

  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [answer, setAnswer] = useState("");
  const [provider, setProvider] = useState("");
  const [responseLanguage, setResponseLanguage] = useState("English");
  const { language, tier } = useI18n();
  const [error, setError] = useState("");
  const [providerFailures, setProviderFailures] = useState<Array<{ provider: string; status: string }>>([]);
  const [loading, setLoading] = useState(false);

  let prompts = [];
  let title = "";
  let subtitle = "";

  if (role === "admin") {
    title = "ARAMBH Workforce Assistant";
    subtitle = "AI-powered insights for workforce capability and training.";
    prompts = [
      "Which departments have the largest competency gaps?",
      "Which competency areas require organization-wide attention?",
      "What are the current workforce training trends?",
      "Summarize organization-level competency gaps."
    ];
  } else if (role === "faculty") {
    title = "ARAMBH Faculty Assistant";
    subtitle = "Your AI companion for teaching, assessment and learner development.";
    prompts = [
      "Which learners have the largest competency gaps?",
      "Which topics need additional learning material?",
      "Summarize learner performance for my assigned learners.",
      "What training content should I prepare for these gaps?"
    ];
  } else {
    title = "ARAMBH Learning Assistant";
    subtitle = "Your personalized learning companion.";
    prompts = [
      "What should I learn next based on my skill gaps?",
      "Explain my top competency gaps.",
      "Why was this course recommended?",
      "How can I improve my Statistical competency?"
    ];
  }

  async function onSubmit(e: FormEvent) { e.preventDefault(); if (!question.trim()) return; setLoading(true); setError(""); setProviderFailures([]); setAnswer(""); setSubmitted(question); try { const { data } = await api.post("/ai/assistant", { question, language }); setAnswer(data.answer || ""); setProvider(data.provider || ""); setResponseLanguage(data.responseLanguage || language); } catch (err: any) { setError(err?.response?.data?.message || "AI is temporarily unavailable. No response was fabricated."); setProviderFailures(err?.response?.data?.failures || []); } finally { setLoading(false); } }
  return <PageShell title={title} subtitle={subtitle}><div className="assistant-layout"><SectionCard title="Conversation" eyebrow="ARAMBH ASSISTANT" className="assistant-conversation"><div className="conversation-messages">{!submitted && !answer && !loading ? <div className="assistant-welcome"><span className="assistant-welcome-mark">A</span><h2>How can I help you move forward?</h2><p>Ask about your competency gaps, learning path or assessment evidence.</p><div className="prompt-list">{prompts.map((prompt) => <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div></div> : null}{submitted ? <div className="chat-bubble user"><span className="chat-meta">You</span>{submitted}</div> : null}{loading ? <div className="chat-bubble assistant"><span className="chat-meta">ARAMBH assistant</span><LoadingState label="Reviewing your learning context…" /></div> : null}{answer ? <div className="chat-bubble assistant"><span className="chat-meta">ARAMBH assistant · {provider || "available provider"}</span><span className="whitespace-pre-wrap">{answer}</span></div> : null}{error ? <div><EmptyState message={error} />{providerFailures.length ? <p className="section-note">Some assistant providers were unavailable; no response was fabricated.</p> : null}</div> : null}</div><form onSubmit={onSubmit} className="assistant-composer"><textarea className="sih-field" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={role === "admin" ? "Ask about workforce capabilities..." : role === "faculty" ? "Ask about learner progress..." : "Ask about your learning path…"} aria-label="Ask the ARAMBH assistant" /><button className="sih-button-primary" disabled={loading || !question.trim()}>{loading ? "Thinking…" : "Ask assistant →"}</button></form><p className="assistant-meta">Response language: {responseLanguage}{tier === 2 ? " · Beta" : ""}</p></SectionCard><aside className="assistant-context"><SectionCard title="Your context" eyebrow="AVAILABLE TO THE ASSISTANT">
  {role === "admin" ? (
    <>
      <div className="context-item"><strong>Workforce capabilities</strong><span>Aggregated competency data across departments.</span></div>
      <div className="context-item"><strong>Organization skill gaps</strong><span>Prioritized org-level competency gaps.</span></div>
    </>
  ) : role === "faculty" ? (
    <>
      <div className="context-item"><strong>Assigned learners</strong><span>Data for learners assigned to you.</span></div>
      <div className="context-item"><strong>Learner skill gaps</strong><span>Aggregated gaps among your learners.</span></div>
    </>
  ) : (
    <>
      <div className="context-item"><strong>Competency profile</strong><span>Questions can use your stored competency evidence.</span></div>
      <div className="context-item"><strong>Skill gaps</strong><span>Ask which gaps should be prioritised next.</span></div>
      <div className="context-item"><strong>Learning path</strong><span>Ask why a recommendation appears in your path.</span></div>
    </>
  )}
  <div className="context-item"><strong>Privacy note</strong><span>Responses use the application context made available by the existing assistant service.</span></div>
</SectionCard></aside></div></PageShell>; }
