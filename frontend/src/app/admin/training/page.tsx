"use client";

import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { PageShell } from "@/components/sih/ui";

export default function AdminTrainingPage() {
  return (
    <RoleGate roles={["admin"]}>
      <PageShell title="Training Oversight" subtitle="Monitor iGOT and NSSTA integration health and catalogues.">
        <div className="flex gap-3">
          <Link href="/admin/integrations" className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white">
            Integrations
          </Link>
          <Link href="/igot" className="rounded-lg border border-white/15 px-4 py-2 text-sm">
            iGOT catalogue
          </Link>
          <Link href="/nssta-training" className="rounded-lg border border-white/15 px-4 py-2 text-sm">
            NSSTA catalogue
          </Link>
        </div>
      </PageShell>
    </RoleGate>
  );
}
