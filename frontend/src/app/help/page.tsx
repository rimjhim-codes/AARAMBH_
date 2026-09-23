"use client";

import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { PageShell } from "@/components/sih/ui";

const flows = [
  ["Complete your profile", "Add your designation, job role, current skills, previous trainings, and interests in Competency Profile.", "/profile"],
  ["Review competency evidence", "Open Competency Profile and Skill Gaps. Self-reported evidence is labelled separately from verified assessment evidence.", "/competencies"],
  ["Take an assessment or quiz", "Use Assessments for competency checks or Quizzes for published MCQs. Quiz attempts are evaluated on the server.", "/assessments"],
  ["Follow the learning path", "Open Learning Path to review recommendations based on recorded gaps and available catalogue content.", "/learning-path"],
  ["Track progress", "Use Performance and Learning History to review activity, quiz outcomes, and progress captured by the platform.", "/performance"]
];

export default function HelpPage() {
  return <RoleGate roles={["employee", "faculty", "admin"]}><PageShell title="Getting Started" subtitle="A short guide to the flows available in Aarambh."><div className="grid gap-4 md:grid-cols-2">{flows.map(([title, body, href], index) => <article key={title} className="rounded-xl border border-white/10 bg-white/5 p-5"><span className="text-sm text-cyan-300">Step {index + 1}</span><h2 className="mt-3 font-medium text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p><Link href={href as never} className="mt-4 inline-block text-sm text-cyan-300 hover:text-cyan-100">Open this area →</Link></article>)}</div><section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5"><h2 className="font-medium text-white">A note about integrations</h2><p className="mt-2 text-sm leading-6 text-zinc-400">iGOT Karmayogi and NSSTA entries are surfaced through the platform’s integration adapters and local catalogue fallback. Live external delivery or synchronization depends on configured provider access.</p></section></PageShell></RoleGate>;
}
