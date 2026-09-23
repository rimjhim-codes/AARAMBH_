"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "./BrandMark";

type IntroPhase = "visible" | "leaving" | "hidden";

const INTRO_DURATION = 3200;
const REDUCED_DURATION = 700;

export function AarambhIntro() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<IntroPhase>("visible");

  useEffect(() => {
    if (pathname !== "/") {
      setPhase("hidden");
      return;
    }

    const seen = window.sessionStorage.getItem("aarambh-intro-seen");
    if (seen) {
      setPhase("hidden");
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? REDUCED_DURATION : INTRO_DURATION;
    const leaveTimer = window.setTimeout(() => setPhase("leaving"), duration - 480);
    const finishTimer = window.setTimeout(() => {
      window.sessionStorage.setItem("aarambh-intro-seen", "1");
      setPhase("hidden");
    }, duration);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(finishTimer);
    };
  }, [pathname]);

  useEffect(() => {
    if (phase === "hidden" || pathname !== "/") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, pathname]);

  function skip() {
    window.sessionStorage.setItem("aarambh-intro-seen", "1");
    setPhase("leaving");
    window.setTimeout(() => setPhase("hidden"), 480);
  }

  if (pathname !== "/" || phase === "hidden") return null;

  return (
    <div className={`aarambh-intro aarambh-intro--${phase}`} aria-label="Aarambh introduction">
      <div className="aarambh-intro__field" aria-hidden="true">
        <span className="aarambh-intro__ring aarambh-intro__ring--outer" />
        <span className="aarambh-intro__ring aarambh-intro__ring--inner" />
        <span className="aarambh-intro__shard aarambh-intro__shard--one" />
        <span className="aarambh-intro__shard aarambh-intro__shard--two" />
        <span className="aarambh-intro__shard aarambh-intro__shard--three" />
        <span className="aarambh-intro__line aarambh-intro__line--one" />
        <span className="aarambh-intro__line aarambh-intro__line--two" />
        <span className="aarambh-intro__node aarambh-intro__node--one" />
        <span className="aarambh-intro__node aarambh-intro__node--two" />
        <span className="aarambh-intro__node aarambh-intro__node--three" />
      </div>
      <div className="aarambh-intro__content">
        <div className="aarambh-intro__lockup">
          <div className="aarambh-intro__emblem"><BrandMark compact /></div>
          <span className="aarambh-intro__wordmark">Aarambh</span>
        </div>
        <p className="aarambh-intro__message">From skills to capability.</p>
      </div>
      <button type="button" className="aarambh-intro__skip" onClick={skip}>Skip intro</button>
    </div>
  );
}
