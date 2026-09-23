"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminCompetenciesPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Comps />
    </RoleGate>
  );
}

function Comps() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "technical",
    description: "",
    keywords: ""
  });
  const [message, setMessage] = useState("");

  async function load() {
    const { data } = await api.get("/admin/competencies");
    setItems(data.competencies || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    try {
      await api.post("/admin/competencies", {
        ...form,
        keywords: form.keywords
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      });
      setMessage("Competency saved.");
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || "Save failed");
    }
  }

  return (
    <PageShell title="Competency Framework" subtitle="Database-driven, application-defined competencies.">
      <div className="grid gap-2 rounded-xl border border-white/10 p-4 md:grid-cols-2">
        <input
          className="rounded border border-white/10 bg-white/5 p-2"
          placeholder="Code"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <input
          className="rounded border border-white/10 bg-white/5 p-2"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          className="rounded border border-white/10 bg-white/5 p-2"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          <option value="statistical">statistical</option>
          <option value="technical">technical</option>
          <option value="digital_governance">digital_governance</option>
          <option value="behavioural_managerial">behavioural_managerial</option>
        </select>
        <input
          className="rounded border border-white/10 bg-white/5 p-2"
          placeholder="Keywords comma-separated"
          value={form.keywords}
          onChange={(e) => setForm({ ...form, keywords: e.target.value })}
        />
        <textarea
          className="rounded border border-white/10 bg-white/5 p-2 md:col-span-2"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button onClick={save} className="rounded bg-cyan-700 px-3 py-2 text-sm text-white">
          Upsert competency
        </button>
      </div>
      {message ? <p className="mt-2 text-sm">{message}</p> : null}
      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No competencies. Backend seed should populate on startup." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr>
                <th className="p-2">Code</th>
                <th className="p-2">Name</th>
                <th className="p-2">Category</th>
                <th className="p-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c._id} className="border-t border-white/10">
                  <td className="p-2">{c.code}</td>
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.category}</td>
                  <td className="p-2">{c.isActive ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
