"use client";

import { useGLTF } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

export function HeroHand() {
  const group = useRef<THREE.Group>(null);

  // Load the provided robotic hand GLB.
  const { scene } = useGLTF("/models/robot_hand.glb", true);

  // Traverse the scene to enhance materials
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.material) {
        child.material.envMapIntensity = 1.5;
        child.material.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={group} dispose={null} position={[0.2, -3.2, 0]} scale={1.8} rotation={[0.2, -Math.PI / 6, 0.1]}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/models/robot_hand.glb");
