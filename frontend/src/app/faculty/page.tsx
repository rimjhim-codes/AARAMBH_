"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RoleGate } from "@/components/RoleGate";

function FacultyLanding() {
  const router = useRouter();
  useEffect(() => { router.replace("/faculty/dashboard"); }, [router]);
  return <div className="p-10 text-sm text-zinc-400">Opening Faculty Portal…</div>;
}

export default function FacultyPage() {
  return <RoleGate roles={["faculty", "admin"]}><FacultyLanding /></RoleGate>;
}
