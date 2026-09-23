import Link from "next/link";

export function HowItWorksExperience() {
  return (
    <div className="reference-page">
      <div className="reference-grid" />
      <header className="reference-header">
        <Link href="/" className="reference-brand"><span className="reference-logo" /><span><strong>AARAMBH</strong><small>ASSESS&nbsp;&nbsp;•&nbsp;&nbsp;ALIGN&nbsp;&nbsp;•&nbsp;&nbsp;ADVANCE</small></span></Link>
        <nav className="reference-nav"><Link href="/">Home</Link><Link href="/help">Help</Link><Link href="/competencies">Platform</Link><Link href="/igot">Ecosystem</Link><Link href="/sih/dashboard">Dashboard</Link></nav>
        <Link href="/login" className="reference-get">Get Started&nbsp; →</Link>
      </header>
      <section className="reference-hero">
        <div className="reference-copy">
          <div className="reference-pill"><i />Skill Today&nbsp; • &nbsp;Stronger Tomorrow</div>
          <h1>From<br /><span>Potential</span><br />to <span>Progress</span></h1>
          <p>ARAMBH is an AI-powered competency intelligence platform that assesses what you know, identifies what you need, recommends what to learn, and measures how you grow.</p>
          <div className="reference-buttons"><Link href="/login" className="reference-button reference-primary">Explore AARAMBH&nbsp; →</Link><span className="reference-button reference-secondary"><span className="reference-play">▶</span>Watch Demo</span></div>
          <div className="reference-tag"><b>➶</b> Empowering a Future-Ready Workforce</div>
        </div>
        <div className="reference-scene">
          <div className="reference-loop"><div className="reference-arc-left" /><div className="reference-arc-right" /><div className="reference-loop-center">Re-assess&nbsp; • &nbsp;Adapt&nbsp; • &nbsp;Grow</div></div>
          <div className="reference-cards">
            <article className="reference-card reference-profile-card"><div className="reference-icon reference-profile-icon"><svg width="76" height="76" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="35" r="19" fill="none" stroke="#5ab9ff" strokeWidth="4" /><path d="M20 82 C25 59 39 53 50 53 C61 53 75 59 80 82" fill="none" stroke="#4db7ff" strokeWidth="4" strokeLinecap="round" /><path d="M39 34 Q50 26 61 34" fill="none" stroke="#9bdcff" strokeWidth="2" opacity=".7" /></svg></div><h2>Learner Profile</h2><p>Understand strengths<br />and goals</p></article><span className="reference-arrow" />
            <article className="reference-card"><div className="reference-icon">◉</div><h2>Competency<br />Assessment</h2><ReferenceMetrics values={[["Python", "42%", "42%"], ["SQL", "38%", "38%"], ["Statistics", "31%", "31%"], ["Communication", "62%", "62%"]]} /></article><span className="reference-arrow" />
            <article className="reference-card"><div className="reference-icon">◌</div><h2>Skill Gap Analysis</h2><ReferenceMetrics values={[["SQL", "High", "82%", "gap"], ["Statistics", "High", "75%", "gap"], ["Visualization", "Medium", "55%", "med"], ["Communication", "Low", "32%", "low"]]} /></article><span className="reference-arrow" />
            <article className="reference-card"><div className="reference-icon">♧</div><h2>Personalized Learning</h2><div className="reference-item"><em>◆</em>iGOT Karmayogi</div><div className="reference-item"><em>♣</em>NSSTA • TPAC</div><div className="reference-item"><em>◈</em>AI-generated MCQs</div><div className="reference-item"><em>♧</em>Virtual Labs</div></article><span className="reference-arrow" />
            <article className="reference-card reference-progress-card"><div className="reference-icon">◥</div><h2>Measurable Progress</h2><ReferenceMetrics values={[["Python", "76%", "76%"], ["SQL", "71%", "71%"], ["Statistics", "68%", "68%"], ["Communication", "82%", "82%"]]} /></article>
          </div>
          <div className="reference-slogan">A Smarter Start<br />for a Stronger You</div><div className="reference-mountain" /><svg className="reference-path" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true"><path d="M140 277 C220 340 300 160 400 220 C500 280 560 100 680 162 C780 220 850 50 940 104" /></svg>
          <div className="reference-node reference-node-one"><span>ASSESS</span></div><div className="reference-node reference-node-two"><span>LEARN</span></div><div className="reference-node reference-node-three"><span>PRACTICE</span></div><div className="reference-node reference-node-four"><span>GROW</span></div>
        </div>
      </section>
      <div className="reference-bottom"><div className="reference-stat"><b>♧</b>Personalized<br />Learning Paths</div><div className="reference-stat"><b>◌</b>Competency-Driven<br />Recommendations</div><div className="reference-stat"><b>♣</b>Integrated with<br />iGOT &amp; NSSTA • TPAC</div><div className="reference-stat"><b>◥</b>Measurable<br />Skill Growth</div><div className="reference-stat"><b>◇</b>Building a<br />Future-Ready India</div></div>
    </div>
  );
}

function ReferenceMetrics({ values }: { values: readonly (readonly [string, string, string, string?])[] }) {
  return <div>{values.map(([label, value, width, tone]) => <div className={`reference-metric ${tone || ""}`} key={label}><label><span>{label}</span><b>{value}</b></label><div className="reference-bar"><i style={{ "--reference-width": width } as React.CSSProperties} /></div></div>)}</div>;
}
