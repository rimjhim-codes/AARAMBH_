"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export function LiveUpdates({ userId }: { userId?: string }) {
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    const socket = io(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8080");
    socket.on("connect", () => socket.emit("join-user", userId));
    socket.on("notification:new", (payload) =>
      setEvents((prev) => [`New ${payload.type} notification`, ...prev].slice(0, 5))
    );
    socket.on("analytics:update", (payload: {
      topic?: string;
      confidenceScore?: number;
      userStats?: { xp: number; studyStreak: number; minutesStudiedTotal: number };
    }) => {
      const line =
        payload.userStats != null
          ? `XP ${payload.userStats.xp} · streak ${payload.userStats.studyStreak} days · ${payload.userStats.minutesStudiedTotal} min studied`
          : `${payload.topic} confidence ${payload.confidenceScore}%`;
      setEvents((prev) => [line, ...prev].slice(0, 5));
    });
    return () => {
      socket.disconnect();
    };
  }, [userId]);

  return (
    <div className="glass min-w-0 rounded-2xl p-4 sm:p-6">
      <h3 className="text-lg font-medium">Live AI Updates</h3>
      <div className="mt-3 space-y-2 text-sm text-zinc-300">
        {events.length === 0 && <p>Waiting for live updates...</p>}
        {events.map((e, idx) => (
          <p className="break-words" key={`${e}-${idx}`}>{e}</p>
        ))}
      </div>
    </div>
  );
}
