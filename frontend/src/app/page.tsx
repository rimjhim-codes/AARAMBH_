import Link from "next/link";
import {
  BarChart3, Target, BookOpen, Search, BrainCircuit, FileText, Link2,
  Bot, Box, Languages, LineChart, Users, ShieldCheck, ChevronRight, Play
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { HeroScene3D } from "@/components/home/HeroScene3D";
import { DynamicMetrics } from "@/components/home/DynamicMetrics";
import { IndiaMapDashboard } from "@/components/home/IndiaMapDashboard";
import { FinalCTAVIsual } from "@/components/home/FinalCTAVIsual";

export default function LandingPage() {
  return (
    <div className="a7-landing-page min-h-screen bg-[#040805] text-white overflow-hidden relative selection:bg-lime-500/30 font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        body:has(.a7-landing-page) .global-header { display: none !important; }

        .a7-glass {
          background: rgba(10, 25, 15, 0.4);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(140, 255, 26, 0.15);
        }

        .neon-text {
          color: #8cff1a;
          text-shadow: 0 0 20px rgba(140, 255, 26, 0.4);
        }

        .bg-glow-radial {
          background: radial-gradient(circle at center, rgba(140, 255, 26, 0.08) 0%, transparent 70%);
        }

        .icon-circle {
          width: 3rem;
          height: 3rem;
          border-radius: 9999px;
          border: 1px solid rgba(140, 255, 26, 0.3);
          background-color: rgba(140, 255, 26, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px rgba(140, 255, 26, 0.15);
          flex-shrink: 0;
        }
      `}} />

      {/* Global Background Grid & Glow */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] pointer-events-none" />
      <div className="fixed top-[-20%] left-[-10%] w-[800px] h-[800px] bg-lime-500/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[800px] h-[800px] bg-green-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-50 flex items-center justify-between px-6 py-4 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-4">
          <BrandMark />
          <div>
            <h1 className="text-xl font-bold tracking-wide text-white">AARAMBH</h1>
            <p className="text-[9px] text-gray-400 uppercase tracking-widest hidden sm:block">Learn • Grow • Serve • Transform</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <Link href="/" className="text-sm font-medium text-lime-400 relative">
            Home
            <span className="absolute -bottom-2 left-0 w-full h-0.5 bg-lime-400 rounded-t-md"></span>
          </Link>
          <Link href="/competencies" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Platform</Link>
          <Link href="/how-it-works" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">How It Works</Link>
          <Link href="/help" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">About</Link>
          <Link href="/help" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Contact</Link>
        </div>

        <div className="flex items-center gap-6">
          <button className="text-gray-400 hover:text-white transition-colors" aria-label="Search">
            <Search size={20} />
          </button>
          <Link href="/login" className="px-7 py-2 rounded-full text-sm font-medium border border-lime-500 text-lime-400 hover:bg-lime-500/10 transition-all">
            Login
          </Link>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main className="relative z-10 max-w-[1400px] mx-auto px-6 pt-16 lg:pt-24 flex flex-col">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-0 items-center min-h-[600px] relative">

          {/* Left Content */}
          <div className="max-w-xl relative z-20">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-lime-500/30 bg-lime-500/10 mb-8">
              <div className="w-2 h-2 rounded-full bg-lime-500 animate-pulse" />
              <span className="text-xs font-semibold text-lime-400 tracking-wider">AI-Powered Learning Platform</span>
            </div>

            <h2 className="text-5xl sm:text-[4rem] leading-[1.1] font-extrabold tracking-tight mb-6">
              BUILD A SMARTER<br />
              <span className="neon-text">STATISTICAL</span> INDIA
            </h2>

            <p className="text-gray-300 text-lg mb-10 leading-relaxed max-w-lg">
              AI-powered competency intelligence and personalized learning for India's statistical workforce.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link href="/login" className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#8cff1a] text-black font-semibold hover:bg-[#9eff33] transition-colors shadow-[0_0_20px_rgba(140,255,26,0.3)] flex items-center justify-center gap-2 group">
                Start Learning <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/how-it-works" className="w-full sm:w-auto px-8 py-3.5 rounded-full border border-white/20 text-white font-medium hover:bg-white/5 transition-colors flex items-center justify-center gap-2 group">
                <Play size={16} className="text-lime-400" /> See How AARAMBH Works
              </Link>
            </div>

            {/* Micro Features beneath Hero CTA */}
            <div className="mt-12 flex flex-wrap items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border border-lime-500/30 bg-lime-500/5 flex items-center justify-center shadow-[0_0_10px_rgba(140,255,26,0.1)]">
                  <BookOpen size={16} className="text-lime-400" />
                </div>
                <span className="text-xs font-medium text-gray-300">Learn<br/>Anytime</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border border-lime-500/30 bg-lime-500/5 flex items-center justify-center shadow-[0_0_10px_rgba(140,255,26,0.1)]">
                  <LineChart size={16} className="text-lime-400" />
                </div>
                <span className="text-xs font-medium text-gray-300">Grow<br/>Your Skills</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border border-lime-500/30 bg-lime-500/5 flex items-center justify-center shadow-[0_0_10px_rgba(140,255,26,0.1)]">
                  <Users size={16} className="text-lime-400" />
                </div>
                <span className="text-xs font-medium text-gray-300">Serve<br/>A Stronger India</span>
              </div>
            </div>
          </div>

          {/* Right 3D Visual Area */}
          <div className="absolute top-0 right-[-10%] w-[120%] h-[120%] lg:w-[60vw] lg:h-[800px] pointer-events-auto">
             <HeroScene3D />

             {/* Text floating near 3D */}
             <div className="absolute right-20 top-1/2 -translate-y-1/2 pointer-events-none hidden lg:block text-right">
                <p className="text-sm italic text-gray-400 max-w-[150px]">
                  "Empowering the minds behind a data-driven India"
                </p>
                <div className="h-[1px] w-12 bg-lime-500 ml-auto mt-4" />
             </div>
          </div>
        </div>

        {/* Dynamic Metrics Strip */}
        <div className="mt-20 z-20 relative">
          <DynamicMetrics />
        </div>

        {/* ABOUT AARAMBH */}
        <section className="mt-32">
          <div className="grid lg:grid-cols-2 gap-16">
            <div>
              <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-4">About AARAMBH</p>
              <h3 className="text-3xl sm:text-4xl font-bold mb-6 leading-tight">
                AI FOR A SKILLED<br />STATISTICAL WORKFORCE
              </h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                AARAMBH leverages AI to identify competency gaps, recommends personalized learning paths, and integrates with the iGOT Karmayogi ecosystem to strengthen the capabilities of India's Official Statistical System.
              </p>
              <Link href="/how-it-works" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-lime-500 text-black font-semibold hover:bg-lime-400 transition-colors">
                Know More <ChevronRight size={16} />
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="a7-glass p-6 rounded-xl flex items-start gap-4 hover:border-lime-500/50 transition-colors">
                <div className="icon-circle">
                  <BrainCircuit size={20} className="text-lime-400" />
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1">Competency Assessment</h4>
                  <p className="text-sm text-gray-400">Identify skill gaps with AI</p>
                </div>
              </div>
              <div className="a7-glass p-6 rounded-xl flex items-start gap-4 hover:border-lime-500/50 transition-colors">
                <div className="icon-circle">
                  <Target size={20} className="text-lime-400" />
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1">Personalized Learning</h4>
                  <p className="text-sm text-gray-400">Tailored learning paths</p>
                </div>
              </div>
              <div className="a7-glass p-6 rounded-xl flex items-start gap-4 hover:border-lime-500/50 transition-colors">
                <div className="icon-circle">
                  <FileText size={20} className="text-lime-400" />
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1">AI Question Generator</h4>
                  <p className="text-sm text-gray-400">Generate MCQs & quizzes</p>
                </div>
              </div>
              <div className="a7-glass p-6 rounded-xl flex items-start gap-4 hover:border-lime-500/50 transition-colors">
                <div className="icon-circle">
                  <Link2 size={20} className="text-lime-400" />
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1">Seamless Integration</h4>
                  <p className="text-sm text-gray-400">With iGOT Karmayogi</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW AARAMBH WORKS */}
        <section className="mt-32">
          <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-2">How AARAMBH Works</p>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-12">
            <h3 className="text-3xl sm:text-4xl font-bold leading-tight">
              A SIMPLE PATH TO<br />CONTINUOUS GROWTH
            </h3>
            <p className="text-gray-400 text-sm max-w-sm lg:text-right">
              From assessment to real impact — AARAMBH supports you at every step.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 relative">
            <div className="hidden lg:block absolute top-10 left-10 right-10 h-[1px] bg-white/10" />

            {[
              { id: '01', title: 'Assess', desc: 'Evaluate your current skills and identify gaps', icon: BarChart3 },
              { id: '02', title: 'Learn', desc: 'Get personalized training recommendations', icon: BookOpen },
              { id: '03', title: 'Practice', desc: 'Take AI-generated quizzes and assessments', icon: FileText },
              { id: '04', title: 'Grow', desc: 'Track progress and build expertise', icon: LineChart }
            ].map((step, idx) => (
              <div key={step.id} className="relative z-10 flex flex-col items-center text-center max-w-[200px]">
                <div className="w-20 h-20 rounded-full bg-[#070b09] border border-lime-500/40 flex flex-col items-center justify-center mb-6 text-lime-400 shadow-[0_0_20px_rgba(140,255,26,0.15)]">
                  <step.icon size={24} className="mb-1" />
                </div>
                <h4 className="font-bold text-white text-xl mb-1">{step.id} <br/> {step.title}</h4>
                <p className="text-xs text-gray-400">{step.desc}</p>

                {idx < 3 && <ChevronRight className="lg:hidden text-lime-500 mt-6" />}
              </div>
            ))}
          </div>
        </section>

        {/* POWERFUL FEATURES */}
        <section className="mt-32 relative">
          <div className="bg-glow-radial absolute inset-0 pointer-events-none" />

          <div className="grid lg:grid-cols-4 gap-8 items-start relative z-10">
            <div className="lg:col-span-1">
              <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-4">Powerful Features</p>
              <h3 className="text-3xl font-bold mb-8 leading-tight">
                Everything You Need<br />in One Platform
              </h3>
              <Link href="/competencies" className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-lime-500/50 text-lime-400 font-semibold hover:bg-lime-500/10 transition-colors">
                Explore Platform <ChevronRight size={16} />
              </Link>
            </div>

            <div className="lg:col-span-3 grid sm:grid-cols-2 gap-6">
              <div className="a7-glass p-6 rounded-xl hover:border-lime-500/50 transition-colors">
                <div className="icon-circle mb-4">
                  <Bot size={20} className="text-lime-400" />
                </div>
                <h4 className="font-bold text-white mb-2">AI Learning Assistant</h4>
                <p className="text-sm text-gray-400">Get instant help, explanations and guidance</p>
              </div>
              <div className="a7-glass p-6 rounded-xl hover:border-lime-500/50 transition-colors">
                <div className="icon-circle mb-4">
                  <Box size={20} className="text-lime-400" />
                </div>
                <h4 className="font-bold text-white mb-2">iGOT Integration</h4>
                <p className="text-sm text-gray-400">Access government's official learning content</p>
              </div>
              <div className="a7-glass p-6 rounded-xl hover:border-lime-500/50 transition-colors">
                <div className="icon-circle mb-4">
                  <Languages size={20} className="text-lime-400" />
                </div>
                <h4 className="font-bold text-white mb-2">Multilingual Support</h4>
                <p className="text-sm text-gray-400">Learn in your preferred language</p>
              </div>
              <div className="a7-glass p-6 rounded-xl hover:border-lime-500/50 transition-colors">
                <div className="icon-circle mb-4">
                  <LineChart size={20} className="text-lime-400" />
                </div>
                <h4 className="font-bold text-white mb-2">Analytics & Insights</h4>
                <p className="text-sm text-gray-400">Track your learning journey</p>
              </div>
              <div className="a7-glass p-6 rounded-xl hover:border-lime-500/50 transition-colors">
                <div className="icon-circle mb-4">
                  <Users size={20} className="text-lime-400" />
                </div>
                <h4 className="font-bold text-white mb-2">Role-based Dashboards</h4>
                <p className="text-sm text-gray-400">For officials, faculty and admins</p>
              </div>
              <div className="a7-glass p-6 rounded-xl hover:border-lime-500/50 transition-colors">
                <div className="icon-circle mb-4">
                  <ShieldCheck size={20} className="text-lime-400" />
                </div>
                <h4 className="font-bold text-white mb-2">Secure & Government Ready</h4>
                <p className="text-sm text-gray-400">Built for India's Official Statistical System</p>
              </div>
            </div>
          </div>
        </section>

        {/* INDIA STATISTICAL ECOSYSTEM */}
        <section className="mt-32">
          <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-4">For India's Statistical Ecosystem</p>
          <h3 className="text-3xl sm:text-4xl font-bold mb-12 leading-tight">
            Built for the People<br />Who Build a Data-Driven India
          </h3>

          <div className="grid lg:grid-cols-12 gap-8 items-center">

            {/* Left Audience Cards */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="a7-glass p-5 rounded-xl border-l-2 border-l-lime-500 bg-lime-500/5 shadow-[0_0_15px_rgba(140,255,26,0.1)]">
                <div className="flex items-center gap-4">
                  <div className="icon-circle w-10 h-10">
                    <Users size={16} className="text-lime-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Government Officials</h4>
                    <p className="text-xs text-gray-400 mt-1">Enhance domain and digital skills</p>
                  </div>
                </div>
              </div>
              <div className="a7-glass p-5 rounded-xl opacity-70 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <BookOpen size={16} className="text-gray-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Trainers & Faculty</h4>
                    <p className="text-xs text-gray-400 mt-1">Create and manage learning content</p>
                  </div>
                </div>
              </div>
              <div className="a7-glass p-5 rounded-xl opacity-70 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <ShieldCheck size={16} className="text-gray-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Administrators</h4>
                    <p className="text-xs text-gray-400 mt-1">Monitor progress and capacity building</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Center Dashboard Visual Approximation */}
            <div className="lg:col-span-7">
              <IndiaMapDashboard />
            </div>

            {/* Right Supporting Text */}
            <div className="lg:col-span-2 text-right lg:text-left h-full flex flex-col justify-center">
              <p className="text-sm text-gray-300 italic mb-4 leading-relaxed">
                "Better Skills<br/>Better Data<br/>Better Decisions<br/><span className="text-white font-bold not-italic">A Stronger India"</span>
              </p>
              <div className="w-10 h-[2px] bg-lime-500 lg:ml-0 ml-auto mb-8 shadow-[0_0_10px_#8cff1a]" />
              <p className="text-[10px] font-bold text-lime-400 tracking-[0.2em] uppercase drop-shadow-[0_0_5px_rgba(140,255,26,0.5)]">Data Empowers<br/>Democracy</p>
            </div>
          </div>
        </section>

        {/* IMPACT SECTION */}
        <section className="mt-32">
          <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-4">Our Impact</p>
          <div className="flex flex-col lg:flex-row justify-between lg:items-end gap-6 mb-12 border-b border-white/10 pb-8 relative">
            <h3 className="text-3xl sm:text-4xl font-bold leading-tight">
              Enabling a Stronger,<br />Smarter India
            </h3>

            <div className="hidden lg:block absolute right-0 bottom-8 max-w-xs text-right">
              <p className="text-gray-400 text-sm italic">"Investing in people who turn data into a better tomorrow."</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="flex items-center gap-4">
              <div className="icon-circle shrink-0">
                <Target size={20} className="text-lime-400" />
              </div>
              <p className="font-bold text-sm">Improved Data<br/>Quality</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="icon-circle shrink-0">
                <Users size={20} className="text-lime-400" />
              </div>
              <p className="font-bold text-sm">Skilled and Future-Ready<br/>Workforce</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="icon-circle shrink-0">
                <BarChart3 size={20} className="text-lime-400" />
              </div>
              <p className="font-bold text-sm">Evidence-Based<br/>Policy Making</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="icon-circle shrink-0">
                <ShieldCheck size={20} className="text-lime-400" />
              </div>
              <p className="font-bold text-sm">Greater Public<br/>Trust</p>
            </div>
          </div>
        </section>

        {/* PARTNERS SECTION */}
        <section className="mt-32">
          <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-4">Our Partners</p>
          <h3 className="text-3xl sm:text-4xl font-bold mb-10 leading-tight">
            Working Together for a Data-Driven Nation
          </h3>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="a7-glass p-6 rounded-xl flex flex-col items-center justify-center text-center gap-4 hover:border-lime-500/50 transition-colors shadow-[0_0_15px_rgba(140,255,26,0.05)]">
              <div className="text-2xl font-black text-orange-400 tracking-tighter">iGOT<br/><span className="text-sm font-semibold text-white tracking-normal">Karmayogi</span></div>
            </div>
            <div className="a7-glass p-6 rounded-xl flex flex-col items-center justify-center text-center gap-4 hover:border-lime-500/50 transition-colors shadow-[0_0_15px_rgba(140,255,26,0.05)]">
              <h4 className="font-bold text-xl text-white">NSSTA</h4>
              <p className="text-[10px] text-gray-400 uppercase">National Statistical Systems<br/>Training Academy</p>
            </div>
            <div className="a7-glass p-6 rounded-xl flex flex-col items-center justify-center text-center gap-4 hover:border-lime-500/50 transition-colors shadow-[0_0_15px_rgba(140,255,26,0.05)]">
              <h4 className="font-bold text-xl text-white">MoSPI</h4>
              <p className="text-[10px] text-gray-400 uppercase">Ministry of Statistics &<br/>Programme Implementation</p>
            </div>
            <div className="a7-glass p-6 rounded-xl flex flex-col items-center justify-center text-center gap-4 hover:border-lime-500/50 transition-colors shadow-[0_0_15px_rgba(140,255,26,0.05)]">
              <div className="icon-circle w-10 h-10 mb-2 border-white/20 bg-white/5">
                <span className="text-[8px] font-bold text-white">GOI</span>
              </div>
              <h4 className="font-bold text-sm text-white">Government of India</h4>
              <p className="text-[10px] text-gray-400 uppercase">सत्यमेव जयते</p>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mt-32 mb-32 relative">
          <div className="a7-glass rounded-3xl p-10 md:p-16 relative overflow-hidden text-center md:text-left flex flex-col md:flex-row items-center justify-between border-lime-500/30">
            {/* Left Content */}
            <div className="relative z-10 w-full md:w-1/2">
              <h2 className="text-4xl sm:text-5xl font-extrabold mb-4">
                Be a Part of a<br />Data-Driven Tomorrow
              </h2>
              <p className="text-gray-300 max-w-md mb-8">
                Start your learning journey with AARAMBH today and contribute to a smarter India.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <Link href="/login" className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-lime-500 text-black font-semibold hover:bg-lime-400 transition-colors shadow-[0_0_20px_rgba(140,255,26,0.3)] flex items-center justify-center gap-2 group">
                  Start Learning <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/how-it-works" className="w-full sm:w-auto px-8 py-3.5 rounded-full border border-white/20 text-white font-medium hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                  <Play size={16} /> Watch Video
                </Link>
              </div>
            </div>

            {/* Right Map/Data Visual */}
            <FinalCTAVIsual />
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#020402] py-12 relative z-20">
        <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <BrandMark />
            <div>
              <h4 className="text-lg font-bold tracking-wide text-white">AARAMBH</h4>
              <p className="text-[8px] text-gray-500 uppercase tracking-widest">Learn • Grow • Serve • Transform</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-gray-400">
            <Link href="/" className="hover:text-lime-400">Home</Link>
            <Link href="/competencies" className="hover:text-lime-400">Platform</Link>
            <Link href="/how-it-works" className="hover:text-lime-400">How It Works</Link>
            <Link href="/help" className="hover:text-lime-400">About</Link>
            <Link href="/help" className="hover:text-lime-400">Contact</Link>
            <span className="text-white/20">|</span>
            <Link href="/help" className="hover:text-white">Privacy</Link>
            <Link href="/help" className="hover:text-white">Terms</Link>
          </div>

          <div className="text-xs text-gray-500 text-right">
            <p>Built for a Smarter Statistical India.</p>
            <p>&copy; 2026 AARAMBH. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
