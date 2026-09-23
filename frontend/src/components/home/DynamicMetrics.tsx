"use client";

import { useEffect, useState } from "react";
import { BookOpen, Layers, Target, BookMarked } from "lucide-react";

export function DynamicMetrics() {
  const [metrics, setMetrics] = useState({
    users: 0,
    courses: 0,
    assessments: 0,
    labs: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("http://localhost:8080/api/public/stats");
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (error) {
        console.error("Failed to fetch public stats", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="a7-glass rounded-2xl p-6 md:p-8 flex flex-wrap lg:flex-nowrap justify-between gap-8 relative overflow-hidden pointer-events-none">
      {/* Government flag decorative line */}
      <div className="absolute top-0 left-8 w-16 h-1 flex">
        <div className="h-full flex-1 bg-orange-500" />
        <div className="h-full flex-1 bg-white" />
        <div className="h-full flex-1 bg-green-600" />
      </div>

      <div className="flex items-center gap-5 lg:border-r border-white/10 lg:pr-4">
        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5">
          <BookOpen className="text-gray-300" size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold text-lime-400">
            {loading ? "..." : metrics.users.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Government Officials<br/>& Professionals</p>
        </div>
      </div>

      <div className="flex items-center gap-5 lg:border-r border-white/10 lg:pr-4">
        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5">
          <Layers className="text-gray-300" size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold text-lime-400">
            {loading ? "..." : metrics.courses.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Training Programs<br/>Available</p>
        </div>
      </div>

      <div className="flex items-center gap-5 lg:border-r border-white/10 lg:pr-4">
        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5">
          <Target className="text-gray-300" size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold text-lime-400">
            {loading ? "..." : metrics.assessments.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Assessments<br/>Completed</p>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5">
          <BookMarked className="text-gray-300" size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold text-lime-400">
            {loading ? "..." : metrics.labs.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Virtual Labs<br/>Completed</p>
        </div>
      </div>
    </div>
  );
}
