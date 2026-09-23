"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RoleGate } from "@/components/RoleGate";

function AdminLanding() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/dashboard"); }, [router]);
  return <div className="p-10 text-sm text-zinc-400">Opening Admin Portal…</div>;
}

export default function AdminPage() {
  return <RoleGate roles={["admin"]}><AdminLanding /></RoleGate>;
}
