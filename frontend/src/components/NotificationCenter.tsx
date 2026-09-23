"use client";

import { useEffect, useState } from "react";
import { useAuthContext } from "@/components/AuthProvider";
import { api } from "@/lib/api";

export function NotificationCenter() {
  const { user } = useAuthContext();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get("/notifications").then(({ data }) => setItems(Array.isArray(data) ? data : [])).catch(() => undefined);
  }, [user]);

  if (!user) return null;
  const unread = items.filter((item) => !item.readAt).length;

  async function markRead(id: string) {
    try {
      const { data } = await api.patch(`/notifications/${id}/read`);
      setItems((current) => current.map((item) => item._id === id ? data : item));
    } catch { /* keep the real notification visible if the update fails */ }
  }

  return (
    <div className="relative">
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((value) => !value)} className="relative rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10">
        <span aria-hidden="true">🔔</span>
        {unread ? <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-cyan-500 px-1 text-center text-[10px] font-semibold text-slate-950">{unread}</span> : null}
      </button>
      {open ? <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-xl border border-cyan-400/20 bg-[#071426] p-3 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="font-medium text-white">Notifications</h2><button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-white">Close</button></div>
        {items.length === 0 ? <p className="mt-4 text-sm text-zinc-400">No notifications yet.</p> : <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{items.map((item) => <button type="button" key={item._id} onClick={() => markRead(item._id)} className={`block w-full rounded-lg border p-3 text-left ${item.readAt ? "border-white/5 bg-white/[0.02]" : "border-cyan-400/20 bg-cyan-400/5"}`}><div className="flex items-start justify-between gap-2"><span className="text-sm font-medium text-zinc-100">{item.title}</span>{!item.readAt ? <span className="text-[10px] uppercase text-cyan-300">New</span> : null}</div><p className="mt-1 text-xs leading-5 text-zinc-400">{item.body}</p><p className="mt-2 text-[10px] text-zinc-600">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</p></button>)}</div>}
      </div> : null}
    </div>
  );
}
