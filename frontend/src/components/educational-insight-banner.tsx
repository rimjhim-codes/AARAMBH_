"use client";

import type { EducationalInsight } from "@/lib/educational";
import {
  SOFT_EDUCATIONAL_WARNING,
  clientEffectiveTier,
  insightBadgeLabel
} from "@/lib/educational";

export function EducationalInsightBadge({
  insight,
  className = ""
}: {
  insight: EducationalInsight | null | undefined;
  className?: string;
}) {
  if (!insight) return null;
  const tier = clientEffectiveTier(insight);
  const palette =
    tier === "full"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tier === "partial"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
        : "border-orange-500/40 bg-orange-500/10 text-orange-100";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${palette} ${className}`}
      title={insight.reasoning || undefined}
    >
      <span>{insightBadgeLabel(insight)}</span>
      <span className="opacity-80">{insight.confidence}%</span>
    </span>
  );
}

export function EducationalSoftWarning({
  insight,
  className = ""
}: {
  insight: EducationalInsight | null | undefined;
  className?: string;
}) {
  if (!insight) return null;
  const tier = clientEffectiveTier(insight);
  if (tier === "full") return null;

  return (
    <div
      className={`rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95 ${className}`}
      role="status"
    >
      <p className="font-medium text-amber-50">{SOFT_EDUCATIONAL_WARNING}</p>
      <p className="mt-1 text-xs text-amber-200/80">{insight.reasoning}</p>
    </div>
  );
}
