"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RoleGate } from "@/components/RoleGate";

function ProfessionalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sih/dashboard");
  }, [router]);
  return <div className="p-10 text-sm text-zinc-400">Opening SIH Workforce Platform…</div>;
}

export default function ProfessionalWorkspacePage() {
  return (
    <RoleGate roles={["employee"]}>
      <ProfessionalRedirect />
    </RoleGate>
  );
}
