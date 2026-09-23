"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { EmptyState, PageShell } from "@/components/sih/ui";
import { api } from "@/lib/api";

export default function AdminAuditPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Audit />
    </RoleGate>
  );
}

function Audit() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    api.get("/admin/audit").then((res) => setLogs(res.data.logs || []));
  }, []);

  return (
    <PageShell title="Audit Log" subtitle="Administrative actions recorded in the database.">
      {logs.length === 0 ? (
        <EmptyState message="No audit events yet." />
      ) : (
        <ul className="space-y-2 text-sm">
          {logs.map((l) => (
            <li key={l._id} className="rounded border border-white/10 p-3">
              <span className="text-cyan-200">{l.action}</span> · {l.resource} ·{" "}
              {new Date(l.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
