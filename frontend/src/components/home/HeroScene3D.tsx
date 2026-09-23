"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { HeroHand } from "./HeroHand";
import { HeroIndiaGlobe } from "./HeroIndiaGlobe";
import { Preload } from "@react-three/drei";

export function HeroScene3D() {
  return (
    <div className="absolute inset-0 z-10 touch-none">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} color={0x8cff1a} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color={0xffffff} />

        <Suspense fallback={null}>
          <HeroHand />
          <HeroIndiaGlobe />
          <Preload all />
        </Suspense>
      </Canvas>
    </div>
  );
}
