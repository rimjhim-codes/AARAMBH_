"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Manual spherical projection for GeoJSON coordinates
function latLongToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

export function HeroIndiaGlobe() {
  const globeGroupRef = useRef<THREE.Group>(null);
  const [indiaGeometry, setIndiaGeometry] = useState<THREE.BufferGeometry | null>(null);

  // Interaction State
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const angularVelocity = useRef({ x: 0, y: 0 });

  // Fetch and parse India GeoJSON
  useEffect(() => {
    async function fetchGeoJson() {
      try {
        const response = await fetch("/data/india.geojson");
        const data = await response.json();

        const points: THREE.Vector3[] = [];
        const RADIUS = 2.02; // slightly larger than the globe sphere

        data.features.forEach((feature: any) => {
          const geometry = feature.geometry;
          if (geometry.type === "Polygon") {
            geometry.coordinates.forEach((ring: any[]) => {
              for (let i = 0; i < ring.length - 1; i++) {
                points.push(latLongToVector3(ring[i][1], ring[i][0], RADIUS));
                points.push(latLongToVector3(ring[i + 1][1], ring[i + 1][0], RADIUS));
              }
            });
          } else if (geometry.type === "MultiPolygon") {
            geometry.coordinates.forEach((polygon: any[]) => {
              polygon.forEach((ring: any[]) => {
                for (let i = 0; i < ring.length - 1; i++) {
                  points.push(latLongToVector3(ring[i][1], ring[i][0], RADIUS));
                  points.push(latLongToVector3(ring[i + 1][1], ring[i + 1][0], RADIUS));
                }
              });
            });
          }
        });

        const geo = new THREE.BufferGeometry().setFromPoints(points);
        setIndiaGeometry(geo);
      } catch (error) {
        console.error("Failed to load India geojson", error);
      }
    }
    fetchGeoJson();
  }, []);

  // Frame Loop for Rotation & Inertia
  useFrame((state, delta) => {
    if (globeGroupRef.current) {
      if (!isDragging.current) {
        // Apply inertia
        globeGroupRef.current.rotation.y += angularVelocity.current.x * delta;
        globeGroupRef.current.rotation.x += angularVelocity.current.y * delta;

        // Damping
        angularVelocity.current.x *= 0.95;
        angularVelocity.current.y *= 0.95;

        // Auto rotation if almost stopped
        if (Math.abs(angularVelocity.current.x) < 0.01 && Math.abs(angularVelocity.current.y) < 0.01) {
          globeGroupRef.current.rotation.y += 0.05 * delta;
        }
      } else {
        // Direct rotation application when dragging
        globeGroupRef.current.rotation.y += angularVelocity.current.x * delta * 5;
        globeGroupRef.current.rotation.x += angularVelocity.current.y * delta * 5;
      }
    }
  });

  // Pointer Handlers
  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    isDragging.current = true;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
    angularVelocity.current = { x: 0, y: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (isDragging.current) {
      e.stopPropagation();
      const deltaX = e.clientX - previousMousePosition.current.x;
      const deltaY = e.clientY - previousMousePosition.current.y;

      angularVelocity.current = {
        x: deltaX * 0.01,
        y: deltaY * 0.01
      };

      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: any) => {
    e.stopPropagation();
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const globeMaterial = useMemo(() => new THREE.MeshPhongMaterial({
    color: 0x07150a,
    emissive: 0x021005,
    specular: 0x8cff1a,
    shininess: 50,
    transparent: true,
    opacity: 0.9,
    wireframe: true,
    wireframeLinewidth: 0.2
  }), []);

  const solidMaterial = useMemo(() => new THREE.MeshPhongMaterial({
    color: 0x040805,
    emissive: 0x000000,
    transparent: true,
    opacity: 0.95
  }), []);

  return (
    <group
      ref={globeGroupRef}
      position={[0, 1.5, 0]}
      rotation={[0.3, -Math.PI / 2 + 0.5, 0]} // initial angle to face India somewhat towards camera
    >
      {/* Invisible larger sphere to catch pointer events smoothly */}
      <mesh
        visible={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOut={handlePointerUp}
      >
        <sphereGeometry args={[2.2, 32, 32]} />
        <meshBasicMaterial />
      </mesh>

      {/* Main Solid Globe */}
      <mesh material={solidMaterial}>
        <sphereGeometry args={[1.98, 64, 64]} />
      </mesh>

      {/* Wireframe overlay */}
      <mesh material={globeMaterial}>
        <sphereGeometry args={[2, 32, 32]} />
      </mesh>

      {/* India Geometry */}
      {indiaGeometry && (
        <lineSegments geometry={indiaGeometry}>
          <lineBasicMaterial color={0x8cff1a} linewidth={2} transparent opacity={0.8} />
        </lineSegments>
      )}

      {/* Glowing atmospheric halo */}
      <mesh scale={[2.1, 2.1, 2.1]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={0x8cff1a} transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}
