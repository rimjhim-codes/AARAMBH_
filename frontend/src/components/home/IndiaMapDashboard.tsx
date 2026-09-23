"use client";

import { useEffect, useState } from "react";
import { LineChart, BarChart3, TrendingUp, Users, Target } from "lucide-react";

export function IndiaMapDashboard() {
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    fetch("/data/india.geojson")
      .then((res) => res.json())
      .then((data) => setGeoData(data))
      .catch((err) => console.error("Failed to load map data", err));
  }, []);

  // Extremely basic path generator for SVG projection
  // (India bounding box roughly approx: 68 to 97 Long, 8 to 37 Lat)
  const renderPaths = () => {
    if (!geoData) return null;

    return geoData.features.map((feature: any, i: number) => {
      if (feature.geometry.type === "Polygon") {
        const d = feature.geometry.coordinates[0].map((coord: any, idx: number) => {
          // crude mercator approximation mapping to a 800x800 viewBox
          const x = (coord[0] - 68) * (800 / 29);
          const y = (37 - coord[1]) * (800 / 29);
          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(" ") + " Z";

        return <path key={i} d={d} fill="rgba(140, 255, 26, 0.1)" stroke="#8cff1a" strokeWidth="1" />;
      }
      return null;
    });
  };

  return (
    <div className="relative aspect-[4/3] bg-[#040805] border border-lime-500/20 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(140,255,26,0.1)] p-5 flex flex-col font-sans">

      {/* Dashboard Top Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[10px] uppercase tracking-widest text-lime-400 font-bold">National Overview</div>
          <div className="h-4 w-24 bg-white/10 rounded flex items-center justify-end px-2">
            <div className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-6 relative z-10">
        {/* Left Side Panel */}
        <div className="w-1/4 flex flex-col gap-4">
          <div className="a7-glass rounded-lg p-4">
            <TrendingUp size={16} className="text-lime-400 mb-2" />
            <div className="text-xl font-bold text-white">45%</div>
            <div className="text-[9px] text-gray-400 uppercase">Skill Growth</div>
          </div>
          <div className="a7-glass rounded-lg p-4">
            <Users size={16} className="text-lime-400 mb-2" />
            <div className="text-xl font-bold text-white">12.5k</div>
            <div className="text-[9px] text-gray-400 uppercase">Active Users</div>
          </div>
          <div className="a7-glass rounded-lg p-4 flex-1 flex flex-col justify-end gap-1">
             <div className="text-[10px] text-gray-400 mb-1">COMPETENCY MAP</div>
             {[40, 70, 50, 90].map((val, i) => (
                <div key={i} className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-lime-500 rounded-full" style={{ width: `${val}%` }} />
                </div>
             ))}
          </div>
        </div>

        {/* Center Map Visual */}
        <div className="flex-1 relative bg-white/5 rounded-xl border border-white/5 overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 mix-blend-screen" />

          <svg viewBox="0 0 800 800" className="w-[120%] h-[120%] opacity-80 drop-shadow-[0_0_15px_rgba(140,255,26,0.4)]">
            {geoData ? renderPaths() : (
              <text x="50%" y="50%" fill="white" textAnchor="middle">Loading Map Data...</text>
            )}
          </svg>

          {/* Glowing node overlays on map */}
          <div className="absolute top-[40%] left-[35%] w-3 h-3 rounded-full bg-lime-400 shadow-[0_0_15px_#8cff1a] animate-pulse">
            <div className="absolute -inset-2 rounded-full border border-lime-400 animate-ping opacity-50" />
          </div>
          <div className="absolute top-[60%] left-[45%] w-2 h-2 rounded-full bg-white shadow-[0_0_10px_white]"></div>
          <div className="absolute top-[30%] left-[60%] w-2 h-2 rounded-full bg-white shadow-[0_0_10px_white]"></div>
        </div>

        {/* Right Side Panel */}
        <div className="w-1/4 flex flex-col gap-4">
          <div className="a7-glass rounded-lg p-4 flex-1 flex flex-col">
            <div className="text-[10px] text-gray-400 uppercase mb-4">Assessment Trends</div>
            <div className="flex items-end gap-2 h-full">
              {[30, 45, 60, 40, 80, 65, 90].map((val, i) => (
                <div key={i} className="flex-1 bg-lime-500/20 hover:bg-lime-500/60 transition-colors rounded-t relative group">
                  <div className="absolute bottom-0 w-full bg-lime-500 rounded-t" style={{ height: `${val}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="a7-glass rounded-lg p-4 flex items-center justify-center aspect-square relative overflow-hidden">
            <Target size={24} className="text-lime-500 absolute inset-0 m-auto opacity-20" />
            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="#8cff1a" strokeWidth="3" strokeDasharray="75, 100"
              />
            </svg>
            <div className="absolute inset-0 m-auto flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-white">75%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
