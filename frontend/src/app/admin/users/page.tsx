"use client";

import { FormEvent, useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminUsersPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Users />
    </RoleGate>
  );
}

function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee"
  });
  const [message, setMessage] = useState("");

  async function load() {
    const { data } = await api.get("/admin/users");
    setUsers(data.users || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/admin/users", form);
      setMessage("User created.");
      setForm({ name: "", email: "", password: "", role: "employee" });
      await load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Create failed");
    }
  }

  async function setRoles(id: string, roles: string[]) {
    try {
      await api.patch(`/admin/users/${id}/roles`, { roles });
      setMessage("Authorized roles updated.");
      await load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Role update failed.");
    }
  }

  return (
    <PageShell title="Manage Users" subtitle="Provision employees, faculty, and admins.">
      <form onSubmit={createUser} className="grid gap-2 rounded-xl border border-white/10 p-4 md:grid-cols-5">
        <input
          className="rounded border border-white/10 bg-white/5 p-2"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="rounded border border-white/10 bg-white/5 p-2"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="rounded border border-white/10 bg-white/5 p-2"
          placeholder="Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          className="rounded border border-white/10 bg-white/5 p-2"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="employee">employee</option>
          <option value="faculty">faculty</option>
        </select>
        <button className="rounded bg-cyan-700 px-3 py-2 text-sm text-white">Create</button>
      </form>
      {message ? <p className="mt-2 text-sm">{message}</p> : null}

      {users.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No users." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Active role</th>
                <th className="p-2">Authorized roles</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-t border-white/10">
                  <td className="p-2">{u.name}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">{u.activeRole || u.role}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-3">
                      {["employee", "faculty"].map((role) => {
                        const roles = u.roles || [u.role];
                        return <label key={role} className="flex items-center gap-1 text-xs text-zinc-300"><input type="checkbox" checked={roles.includes(role)} onChange={(event) => {
                          const next = event.target.checked ? [...roles, role] : roles.filter((item: string) => item !== role);
                          if (next.length) void setRoles(u._id, next.filter((item: string) => item !== "admin" && item !== "student"));
                        }} />{role}</label>;
                      })}
                      {(u.roles || [u.role]).includes("admin") ? <span className="text-xs text-amber-300">admin (bootstrap-only)</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
