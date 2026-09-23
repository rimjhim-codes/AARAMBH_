"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, ClipboardCheck, Target } from "lucide-react";
import { BrandMark } from "./BrandMark";

export function Hero() {
  return (
    <section className="landing-surface border-b border-slate-200 px-5 py-14 sm:px-8 sm:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_.9fr] lg:gap-20">
        <div>
          <div className="mb-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[.16em] text-blue-800"><BrandMark compact /><span>AI-powered competency intelligence platform</span></div>
          <h1 className="landing-heading">Building a <span className="text-orange-600">future-ready</span> statistical workforce</h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Assess capability, understand skill gaps, and follow a role-aligned learning path for India&apos;s official statistical system.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/login" className="sih-button-primary inline-flex items-center justify-center gap-2 px-6 py-3">Get started <ArrowRight size={16} /></Link><Link href="/how-it-works" className="sih-button-secondary inline-flex items-center justify-center px-6 py-3">See how Aarambh works</Link></div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-700" /> Evidence-led</span><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-700" /> Role-aware</span><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-700" /> Built for public service</span></div>
        </div>
        <div className="landing-panel rounded-xl p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-blue-700">Competency intelligence</p><h2 className="mt-2 text-xl font-semibold text-slate-900">A clearer next step</h2></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Evidence-led</span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">{[[BarChart3, "Assess", "See current capability"], [Target, "Analyze", "Find priority gaps"], [ClipboardCheck, "Advance", "Follow learning progress"]].map(([Icon, title, body]) => { const Component = Icon as typeof BarChart3; return <div key={title as string} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><Component size={20} className="text-blue-700" /><p className="mt-5 font-semibold text-slate-900">{title as string}</p><p className="mt-1 text-xs leading-5 text-slate-500">{body as string}</p></div>; })}</div>
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">Your development view</span><span className="text-xs font-medium text-blue-700">Current · Required · Gap</span></div><div className="mt-5 space-y-4">{["Statistical methods", "Data quality", "Digital governance"].map((label, index) => <div key={label}><div className="mb-1 flex justify-between text-xs text-slate-600"><span>{label}</span><span>{["Current evidence", "Priority gap", "Learning focus"][index]}</span></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${index === 1 ? "w-2/5 bg-orange-500" : index === 2 ? "w-3/5 bg-blue-600" : "w-4/5 bg-emerald-600"}`} /></div></div>)}</div></div>
          <p className="mt-5 text-xs leading-5 text-slate-500">Illustrative interface preview. Live values appear after you sign in and complete your profile.</p>
        </div>
      </div>
    </section>
  );
}
