"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminDepartmentsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Departments />
    </RoleGate>
  );
}

function Departments() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", code: "", description: "", organization: "" });
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function load() { const { data } = await api.get("/admin/departments"); setItems(data.departments || []); }
  useEffect(() => { load().catch(() => setMessage("Could not load departments.")); }, []);
  async function save() {
    try {
      await (editingCode ? api.patch(`/admin/departments/${editingCode}`, form) : api.post("/admin/departments", form));
      setForm({ name: "", code: "", description: "", organization: "" });
      setEditingCode(null);
      setMessage("Department saved.");
      await load();
    }
    catch (e: any) { setMessage(e?.response?.data?.message || "Could not save department."); }
  }
  return (
    <PageShell title="Departments" subtitle="Organization / department registry used by employee profiles.">
      <div className="grid gap-2 rounded-xl border border-white/10 p-4 md:grid-cols-2">
        {(["name", "code", "organization"] as const).map((field) => <input key={field} placeholder={field} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="rounded border border-white/10 bg-white/5 p-2" />)}
        <textarea placeholder="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded border border-white/10 bg-white/5 p-2" />
        <button type="button" onClick={save} className="rounded bg-cyan-700 px-3 py-2 text-sm text-white">Save department</button>
      </div>
      {message ? <p className="mt-2 text-sm text-zinc-300">{message}</p> : null}
      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10"><table className="min-w-full text-left text-sm"><thead className="text-zinc-400"><tr><th className="p-3">Name</th><th className="p-3">Code</th><th className="p-3">Organization</th><th className="p-3">Description</th><th className="p-3">Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item._id} className="border-t border-white/10"><td className="p-3">{item.name}</td><td className="p-3">{item.code}</td><td className="p-3">{item.organization}</td><td className="p-3">{item.description}</td><td className="p-3"><button type="button" onClick={() => { setEditingCode(item.code); setForm({ name: item.name, code: item.code, description: item.description || "", organization: item.organization || "" }); }} className="text-cyan-300">Edit</button></td></tr>)}</tbody></table></div>
      <Link href="/admin/users" className="mt-5 inline-block text-sm text-cyan-300">Manage users</Link>
    </PageShell>
  );
}
