"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function LandingParticles() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const dots = rootRef.current.querySelectorAll(".dot");
    gsap.to(dots, {
      y: -18,
      duration: 2.2,
      stagger: 0.12,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
  }, []);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 -z-10">
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="dot absolute h-1.5 w-1.5 rounded-full bg-cyan-300/70"
          style={{
            left: `${(i * 7) % 100}%`,
            top: `${10 + ((i * 13) % 70)}%`
          }}
        />
      ))}
    </div>
  );
}
