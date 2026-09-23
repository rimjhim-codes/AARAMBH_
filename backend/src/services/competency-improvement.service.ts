import { CompetencyScoreModel, CompetencyModel } from "../models/sih/SihModels";
import {
  getEvidenceLineage,
  type EvidenceLineageItem,
  type EvidenceLineageCompetency,
  type LineageStrength
} from "./evidence-lineage.service";
import { createAnalyticsDateRange, type AnalyticsDateRangeInput } from "./analytics-foundation.service";

export type ImprovementClassification = "improved" | "unchanged" | "declined" | "insufficient_evidence";
export type ImprovementConfidence = "high" | "medium" | "low" | "insufficient";

export type CompetencyObservation = {
  proficiency: number;
  observedAt: Date;
  source?: string;
  frameworkId?: string;
  frameworkVersionId?: string;
  frameworkVersion?: string;
  proficiencyScale?: string;
};

export type ImprovementEvidenceSummary = {
  directEvidenceCount: number;
  associatedEvidenceCount: number;
  unavailableEvidenceCount: number;
  linkedOutcomeIds: string[];
  evidenceTypes: string[];
  evidenceTimestamps: Date[];
  sources: string[];
  providerSources: string[];
  resourceTypes: string[];
  validatedOutcomeCount: number;
  personalizationTraceReferences: string[];
};

export type CompetencyImprovementItem = {
  competencyId: string;
  competencyName?: string;
  competencyCode?: string;
  baseline?: CompetencyObservation;
  latest?: CompetencyObservation;
  improvement: {
    proficiencyDelta?: number;
    classification: ImprovementClassification;
  };
  evidenceSummary: ImprovementEvidenceSummary;
  framework: {
    frameworkId?: string;
    frameworkVersionId?: string;
    frameworkVersion?: string;
    proficiencyScale?: string;
    compatible: boolean;
  };
  confidence: ImprovementConfidence;
  limitations: string[];
};

export type CompetencyImprovementQuery = AnalyticsDateRangeInput & {
  competencyId?: string;
  limit?: number;
};

export type CompetencyImprovementResult = {
  dateRange: ReturnType<typeof createAnalyticsDateRange>;
  items: CompetencyImprovementItem[];
};

type ScoreHistoryEntry = {
  date?: unknown;
  level?: unknown;
  source?: unknown;
  frameworkId?: unknown;
  frameworkVersionId?: unknown;
  frameworkVersion?: unknown;
  proficiencyScale?: unknown;
};

type ScoreRecord = {
  _id?: unknown;
  competencyId: unknown;
  currentLevel?: unknown;
  frameworkId?: unknown;
  frameworkVersionId?: unknown;
  frameworkVersion?: unknown;
  proficiencyScale?: unknown;
  evidence?: Array<Record<string, unknown>>;
  history?: ScoreHistoryEntry[];
};

export type CompetencyScoreAnalyticsRecord = ScoreRecord;

type CompetencyRecord = {
  _id: unknown;
  name?: string;
  code?: string;
};

function idOf(value: unknown) {
  return String(value || "");
}

function dateOf(value: unknown) {
  if (value instanceof Date) return value;
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function numberOf(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function getCompetencyHistoryObservations(score: ScoreRecord, range?: { from?: Date; to?: Date }) {
  const observations: CompetencyObservation[] = [];
  for (const entry of score.history || []) {
    const proficiency = numberOf(entry.level);
    const observedAt = dateOf(entry.date);
    if (proficiency === undefined || !observedAt) continue;
    if (range?.from && observedAt < range.from) continue;
    if (range?.to && observedAt > range.to) continue;
    observations.push({
      proficiency,
      observedAt,
      source: entry.source ? String(entry.source) : undefined,
      frameworkId: entry.frameworkId ? String(entry.frameworkId) : score.frameworkId ? String(score.frameworkId) : undefined,
      frameworkVersionId: entry.frameworkVersionId ? idOf(entry.frameworkVersionId) : score.frameworkVersionId ? idOf(score.frameworkVersionId) : undefined,
      frameworkVersion: entry.frameworkVersion ? String(entry.frameworkVersion) : score.frameworkVersion ? String(score.frameworkVersion) : undefined,
      proficiencyScale: entry.proficiencyScale ? String(entry.proficiencyScale) : score.proficiencyScale ? String(score.proficiencyScale) : undefined
    });
  }
  observations.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  // Legacy records can contain repeated identical history pushes. They are
  // not separate observations when all persisted identifying fields match.
  const seen = new Set<string>();
  return observations.filter((entry) => {
    const key = [entry.observedAt.toISOString(), entry.proficiency, entry.source || "", entry.frameworkId || "", entry.frameworkVersionId || "", entry.proficiencyScale || ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function frameworkFor(observation: CompetencyObservation | undefined, score: ScoreRecord) {
  return {
    frameworkId: observation?.frameworkId || (score.frameworkId ? String(score.frameworkId) : undefined),
    frameworkVersionId: observation?.frameworkVersionId || (score.frameworkVersionId ? idOf(score.frameworkVersionId) : undefined),
    frameworkVersion: observation?.frameworkVersion || (score.frameworkVersion ? String(score.frameworkVersion) : undefined),
    proficiencyScale: observation?.proficiencyScale || (score.proficiencyScale ? String(score.proficiencyScale) : undefined)
  };
}

function frameworkSignature(observation: CompetencyObservation | undefined) {
  if (!observation) return "";
  return [observation.frameworkId || "", observation.frameworkVersionId || observation.frameworkVersion || "", observation.proficiencyScale || ""].join("|");
}

function evidenceForObservation(items: EvidenceLineageItem[], competencyId: string, observation: CompetencyObservation) {
  const matched: Array<{ item: EvidenceLineageItem; competency: EvidenceLineageCompetency }> = [];
  for (const item of items) {
    for (const competency of item.competencies) {
      if (competency.competencyId !== competencyId) continue;
      const historyMatches = competency.historyTimestamp
        && competency.historyTimestamp.getTime() === observation.observedAt.getTime();
      const evidenceMatches = competency.evidenceTimestamp
        && competency.evidenceTimestamp.getTime() <= observation.observedAt.getTime();
      if (historyMatches || evidenceMatches) matched.push({ item, competency });
    }
  }
  const seen = new Set<string>();
  return matched.filter(({ item, competency }) => {
    const key = `${item.id}:${competency.competencyId}:${competency.evidenceReference || competency.historyTimestamp?.toISOString() || "unavailable"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyEvidenceSummary(): ImprovementEvidenceSummary {
  return {
    directEvidenceCount: 0,
    associatedEvidenceCount: 0,
    unavailableEvidenceCount: 0,
    linkedOutcomeIds: [],
    evidenceTypes: [],
    evidenceTimestamps: [],
    sources: [],
    providerSources: [],
    resourceTypes: [],
    validatedOutcomeCount: 0,
    personalizationTraceReferences: []
  };
}

function summarizeEvidence(
  baselineMatches: ReturnType<typeof evidenceForObservation>,
  latestMatches: ReturnType<typeof evidenceForObservation>,
  observationCount: number
) {
  const summary = emptyEvidenceSummary();
  const all = [...baselineMatches, ...latestMatches];
  const seen = new Set<string>();
  for (const { item, competency } of all) {
    const key = competency.evidenceReference
      || `${competency.competencyId}:${competency.historyTimestamp?.toISOString() || "unavailable"}:${item.outcomeId || item.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (competency.strength === "direct") summary.directEvidenceCount += 1;
    else if (competency.strength === "associated") summary.associatedEvidenceCount += 1;
    else summary.unavailableEvidenceCount += 1;
    if (item.outcomeId) summary.linkedOutcomeIds.push(item.outcomeId);
    if (competency.evidenceType) summary.evidenceTypes.push(competency.evidenceType);
    if (competency.evidenceTimestamp) summary.evidenceTimestamps.push(competency.evidenceTimestamp);
    summary.sources.push(item.source);
    const providerSource = item.metadata?.providerSource;
    if (typeof providerSource === "string" && providerSource) summary.providerSources.push(providerSource);
    if (item.resourceType) summary.resourceTypes.push(item.resourceType);
    if (item.validatedOutcome) summary.validatedOutcomeCount += 1;
    if (item.personalization?.traceReference) summary.personalizationTraceReferences.push(item.personalization.traceReference);
  }
  summary.unavailableEvidenceCount += Math.max(0, observationCount - new Set(all.map(({ competency }) => competency.historyTimestamp?.getTime())).size);
  summary.linkedOutcomeIds = unique(summary.linkedOutcomeIds);
  summary.evidenceTypes = unique(summary.evidenceTypes);
  summary.evidenceTimestamps = [...new Map(summary.evidenceTimestamps.map((date) => [date.getTime(), date])).values()];
  summary.sources = unique(summary.sources);
  summary.providerSources = unique(summary.providerSources);
  summary.resourceTypes = unique(summary.resourceTypes);
  summary.personalizationTraceReferences = unique(summary.personalizationTraceReferences);
  return summary;
}

export function classifyImprovementConfidence(
  observationCount: number,
  summary: ImprovementEvidenceSummary,
  classification: ImprovementClassification
): ImprovementConfidence {
  if (classification === "insufficient_evidence" || observationCount < 2) return "insufficient";
  if (summary.directEvidenceCount >= 2) return "high";
  if (summary.directEvidenceCount >= 1 || summary.associatedEvidenceCount >= 2) return "medium";
  return "low";
}

function incompatibleFramework(baseline: CompetencyObservation, latest: CompetencyObservation) {
  return frameworkSignature(baseline) !== frameworkSignature(latest);
}

export type CompetencyObservationComparison = {
  proficiencyDelta?: number;
  classification: ImprovementClassification;
  compatible: boolean;
  limitation?: string;
};

export function compareCompetencyObservations(
  baseline: CompetencyObservation | undefined,
  latest: CompetencyObservation | undefined
): CompetencyObservationComparison {
  if (!baseline || !latest) return { classification: "insufficient_evidence", compatible: true };
  if (incompatibleFramework(baseline, latest)) {
    return {
      classification: "insufficient_evidence",
      compatible: false,
      limitation: "Baseline and latest observations use incompatible framework, version, or proficiency-scale metadata."
    };
  }
  const proficiencyDelta = Number((latest.proficiency - baseline.proficiency).toFixed(4));
  return {
    proficiencyDelta,
    classification: proficiencyDelta > 0 ? "improved" : proficiencyDelta < 0 ? "declined" : "unchanged",
    compatible: true
  };
}

function buildImprovementItem(
  score: ScoreRecord,
  competency: CompetencyRecord | undefined,
  items: EvidenceLineageItem[],
  range: ReturnType<typeof createAnalyticsDateRange>
): CompetencyImprovementItem {
  const competencyId = idOf(score.competencyId);
  const observations = getCompetencyHistoryObservations(score, range);
  const baseline = observations[0];
  const latest = observations[observations.length - 1];
  const limitations: string[] = [];
  let classification: ImprovementClassification = "insufficient_evidence";
  let proficiencyDelta: number | undefined;
  let compatible = true;

  if (observations.length < 2) {
    limitations.push(observations.length === 0
      ? "No reliable competency history exists in the selected range."
      : "Only one reliable competency observation exists; improvement cannot be measured.");
  } else {
    const comparison = compareCompetencyObservations(baseline, latest);
    compatible = comparison.compatible;
    classification = comparison.classification;
    proficiencyDelta = comparison.proficiencyDelta;
    if (comparison.limitation) limitations.push(comparison.limitation);
  }

  const baselineMatches = baseline ? evidenceForObservation(items, competencyId, baseline) : [];
  const latestMatches = latest ? evidenceForObservation(items, competencyId, latest) : [];
  const evidenceSummary = summarizeEvidence(baselineMatches, latestMatches, observations.length);
  if (evidenceSummary.associatedEvidenceCount > 0) limitations.push("Some supporting evidence is associated by persisted source and timestamp rather than a direct evidence key.");
  if (evidenceSummary.unavailableEvidenceCount > 0) limitations.push("Some competency observations have no linked learning evidence in the selected range.");
  if (evidenceSummary.validatedOutcomeCount > 0) limitations.push("Validated outcomes support traceability, but do not establish causal attribution.");
  if (latest && !latest.source) limitations.push("The latest competency observation has no persisted source label.");

  const framework = frameworkFor(latest || baseline, score);
  return {
    competencyId,
    ...(competency?.name ? { competencyName: competency.name } : {}),
    ...(competency?.code ? { competencyCode: competency.code } : {}),
    ...(baseline ? { baseline } : {}),
    ...(latest ? { latest } : {}),
    improvement: { ...(proficiencyDelta !== undefined ? { proficiencyDelta } : {}), classification },
    evidenceSummary,
    framework: { ...framework, compatible },
    confidence: classifyImprovementConfidence(observations.length, evidenceSummary, classification),
    limitations: unique(limitations)
  };
}

/** Pure builder used by the service and focused tests. It performs no writes. */
export function buildCompetencyImprovement(
  scores: ScoreRecord[],
  competencies: CompetencyRecord[],
  lineageItems: EvidenceLineageItem[],
  range: ReturnType<typeof createAnalyticsDateRange>,
  competencyId?: string
) {
  const names = new Map(competencies.map((competency) => [idOf(competency._id), competency]));
  return scores
    .filter((score) => !competencyId || idOf(score.competencyId) === competencyId)
    .map((score) => buildImprovementItem(score, names.get(idOf(score.competencyId)), lineageItems, range));
}

/**
 * Read-only learner-scoped competency improvement service. It consumes the
 * existing score/history documents and Phase 5.8.3.1 lineage contract; it does
 * not update competency, outcome, progress, gap, recommendation, or snapshot data.
 */
export async function getCompetencyImprovement(userId: string, query: CompetencyImprovementQuery = {}): Promise<CompetencyImprovementResult> {
  const dateRange = createAnalyticsDateRange(query);
  const limit = Math.min(250, Math.max(1, Math.floor(query.limit || 100)));
  const scoreFilter = { userId, ...(query.competencyId ? { competencyId: query.competencyId } : {}) };
  const scores = await CompetencyScoreModel.find(scoreFilter)
    .select("_id competencyId currentLevel frameworkId frameworkVersionId frameworkVersion proficiencyScale history evidence")
    .limit(limit)
    .lean() as unknown as ScoreRecord[];
  const competencyIds = scores.map((score) => idOf(score.competencyId)).filter(Boolean);
  const competencies = competencyIds.length
    ? await CompetencyModel.find({ _id: { $in: competencyIds } }).select("_id name code").lean() as unknown as CompetencyRecord[]
    : [];
  const lineage = await getEvidenceLineage(userId, { ...query, from: dateRange.from, to: dateRange.to, limit: 250 });
  return {
    dateRange,
    items: buildCompetencyImprovement(scores, competencies, lineage.items, dateRange, query.competencyId)
  };
}
