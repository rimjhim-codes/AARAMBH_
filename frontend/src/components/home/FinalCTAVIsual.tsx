"use client";

import { useEffect, useState } from "react";

export function FinalCTAVIsual() {
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    fetch("/data/india.geojson")
      .then((res) => res.json())
      .then((data) => setGeoData(data))
      .catch((err) => console.error("Failed to load map data", err));
  }, []);

  const renderPaths = () => {
    if (!geoData) return null;

    return geoData.features.map((feature: any, i: number) => {
      if (feature.geometry.type === "Polygon") {
        const d = feature.geometry.coordinates[0].map((coord: any, idx: number) => {
          const x = (coord[0] - 68) * (500 / 29);
          const y = (37 - coord[1]) * (500 / 29);
          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(" ") + " Z";

        return <path key={i} d={d} fill="none" stroke="rgba(140, 255, 26, 0.5)" strokeWidth="1.5" />;
      }
      return null;
    });
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-1/2 flex items-center justify-end pointer-events-none opacity-40 mix-blend-screen overflow-hidden">
      {/* Background grid texture */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 mask-image:linear-gradient(to_left,black,transparent)" />

      {/* Abstract data rings */}
      <div className="absolute -right-20 top-1/2 -translate-y-1/2 w-[500px] h-[500px] border-[1px] border-lime-500/10 rounded-full" />
      <div className="absolute -right-10 top-1/2 -translate-y-1/2 w-[400px] h-[400px] border-[2px] border-lime-500/20 border-dashed rounded-full animate-[spin_60s_linear_infinite]" />

      {/* Wireframe India map rotated dynamically */}
      <svg viewBox="0 0 500 500" className="w-[80%] h-[80%] drop-shadow-[0_0_15px_rgba(140,255,26,0.6)] transform translate-x-12">
        {geoData ? renderPaths() : null}
      </svg>

      <div className="absolute right-32 top-[40%] w-3 h-3 rounded-full bg-lime-400 shadow-[0_0_20px_#8cff1a] animate-pulse" />
      <div className="absolute right-48 top-[60%] w-2 h-2 rounded-full bg-lime-400 shadow-[0_0_15px_#8cff1a]" />
    </div>
  );
}
