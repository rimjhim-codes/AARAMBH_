import { CompetencyModel, CompetencyScoreModel } from "../models/sih/SihModels";
import {
  classifyImprovementConfidence,
  compareCompetencyObservations,
  getCompetencyHistoryObservations,
  type CompetencyObservation,
  type CompetencyScoreAnalyticsRecord,
  type ImprovementEvidenceSummary,
  type ImprovementClassification
} from "./competency-improvement.service";
import {
  getEvidenceLineage,
  type EvidenceLineageCompetency,
  type EvidenceLineageItem,
  type LineageStrength
} from "./evidence-lineage.service";
import { createAnalyticsDateRange, type AnalyticsDateRangeInput } from "./analytics-foundation.service";

export type LearningAnchor = {
  source: string;
  resourceType?: string;
  resourceId?: string;
  timestamp: Date;
  completionReference?: string;
  outcomeId: string;
  /** Existing provider/source identity; not a synthetic universal cycle ID. */
  sourceEventId?: string;
  outcomeType?: string;
  outcomeSource?: string;
  validatedOutcome: boolean;
  competencyIds: string[];
  lineageStrength: LineageStrength;
  providerSource?: string;
};

export type TemporalEvidenceReference = {
  lineageStrength: LineageStrength;
  outcomeId?: string;
  evidenceReference?: string;
  evidenceType?: string;
  timestamp?: Date;
  source: string;
  resourceType?: string;
  resourceId?: string;
  validatedOutcome: boolean;
  providerSource?: string;
  personalizationTraceReference?: string;
};

export type BeforeAfterCompetencyItem = {
  competencyId: string;
  competencyName?: string;
  competencyCode?: string;
  learningAnchor: LearningAnchor;
  before?: CompetencyObservation;
  after?: CompetencyObservation;
  observedChange: {
    proficiencyDelta?: number;
    classification: ImprovementClassification;
  };
  evidence: {
    before: TemporalEvidenceReference[];
    learningPeriod: TemporalEvidenceReference[];
    after: TemporalEvidenceReference[];
  };
  lineage: {
    before: LineageStrength;
    learningPeriod: LineageStrength;
    after: LineageStrength;
    overall: LineageStrength;
  };
  confidence: "high" | "medium" | "low" | "insufficient";
  framework: {
    frameworkId?: string;
    frameworkVersionId?: string;
    frameworkVersion?: string;
    proficiencyScale?: string;
    compatible: boolean;
  };
  limitations: string[];
};

export type CompetencyBeforeAfterQuery = AnalyticsDateRangeInput & {
  competencyId?: string;
  limit?: number;
};

export type CompetencyBeforeAfterResult = {
  dateRange: ReturnType<typeof createAnalyticsDateRange>;
  anchors: LearningAnchor[];
  items: BeforeAfterCompetencyItem[];
  limitations: string[];
};

type CompetencyRecord = { _id: unknown; name?: string; code?: string };

function idOf(value: unknown) {
  return String(value || "");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function strengthOf(references: TemporalEvidenceReference[]): LineageStrength {
  if (references.some((reference) => reference.lineageStrength === "direct")) return "direct";
  if (references.some((reference) => reference.lineageStrength === "associated")) return "associated";
  return "unavailable";
}

function strongest(values: LineageStrength[]): LineageStrength {
  if (values.includes("direct")) return "direct";
  if (values.includes("associated")) return "associated";
  return "unavailable";
}

function toReference(item: EvidenceLineageItem, competency: EvidenceLineageCompetency): TemporalEvidenceReference {
  return {
    lineageStrength: competency.strength,
    ...(item.outcomeId ? { outcomeId: item.outcomeId } : {}),
    ...(competency.evidenceReference ? { evidenceReference: competency.evidenceReference } : {}),
    ...(competency.evidenceType ? { evidenceType: competency.evidenceType } : {}),
    ...(competency.evidenceTimestamp ? { timestamp: competency.evidenceTimestamp } : item.outcomeTimestamp ? { timestamp: item.outcomeTimestamp } : {}),
    source: item.source,
    ...(item.resourceType ? { resourceType: item.resourceType } : {}),
    ...(item.resourceId ? { resourceId: item.resourceId } : {}),
    validatedOutcome: item.validatedOutcome,
    ...(item.metadata?.providerSource ? { providerSource: String(item.metadata.providerSource) } : {}),
    ...(item.personalization?.traceReference ? { personalizationTraceReference: item.personalization.traceReference } : {})
  };
}

function referencesForObservation(items: EvidenceLineageItem[], competencyId: string, observation: CompetencyObservation | undefined) {
  if (!observation) return [];
  const references: TemporalEvidenceReference[] = [];
  for (const item of items) {
    for (const competency of item.competencies) {
      if (competency.competencyId !== competencyId) continue;
      const sameHistory = competency.historyTimestamp?.getTime() === observation.observedAt.getTime();
      const evidenceBeforeObservation = competency.evidenceTimestamp
        && competency.evidenceTimestamp.getTime() <= observation.observedAt.getTime();
      if (sameHistory || evidenceBeforeObservation) references.push(toReference(item, competency));
    }
  }
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = reference.evidenceReference
      || `${reference.outcomeId || ""}:${competencyId}:${reference.timestamp?.getTime() || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function referencesDuringLearningPeriod(items: EvidenceLineageItem[], competencyId: string, anchor: LearningAnchor, after: CompetencyObservation | undefined) {
  return items
    .filter((item) => item.outcomeId
      && item.outcomeTimestamp
      && item.outcomeTimestamp.getTime() >= anchor.timestamp.getTime()
      && (!after || item.outcomeTimestamp.getTime() <= after.observedAt.getTime()))
    .flatMap((item) => item.competencies
      .filter((competency) => competency.competencyId === competencyId)
      .map((competency) => toReference(item, competency)))
    .filter((reference, index, all) => {
      const key = reference.evidenceReference || `${reference.outcomeId || ""}:${reference.timestamp?.getTime() || ""}`;
      return all.findIndex((candidate) => (candidate.evidenceReference || `${candidate.outcomeId || ""}:${candidate.timestamp?.getTime() || ""}`) === key) === index;
    });
}

function evidenceSummary(
  before: TemporalEvidenceReference[],
  learningPeriod: TemporalEvidenceReference[],
  after: TemporalEvidenceReference[],
  observationCount: number
): ImprovementEvidenceSummary {
  const all = [...before, ...learningPeriod, ...after];
  const direct = all.filter((reference) => reference.lineageStrength === "direct");
  const associated = all.filter((reference) => reference.lineageStrength === "associated");
  return {
    directEvidenceCount: new Set(direct.map((reference) => reference.evidenceReference || reference.outcomeId)).size,
    associatedEvidenceCount: new Set(associated.map((reference) => reference.evidenceReference || reference.outcomeId)).size,
    unavailableEvidenceCount: all.length ? 0 : observationCount,
    linkedOutcomeIds: unique(all.map((reference) => reference.outcomeId).filter((id): id is string => Boolean(id))),
    evidenceTypes: unique(all.map((reference) => reference.evidenceType).filter((type): type is string => Boolean(type))),
    evidenceTimestamps: [...new Map(all.map((reference) => reference.timestamp).filter((date): date is Date => Boolean(date)).map((date) => [date.getTime(), date])).values()],
    sources: unique(all.map((reference) => reference.source)),
    providerSources: unique(all.map((reference) => reference.providerSource).filter((source): source is string => Boolean(source))),
    resourceTypes: unique(all.map((reference) => reference.resourceType).filter((type): type is string => Boolean(type))),
    validatedOutcomeCount: new Set(all.filter((reference) => reference.validatedOutcome).map((reference) => reference.outcomeId || reference.evidenceReference)).size,
    personalizationTraceReferences: unique(all.map((reference) => reference.personalizationTraceReference).filter((reference): reference is string => Boolean(reference)))
  };
}

function buildAnchor(item: EvidenceLineageItem): LearningAnchor | undefined {
  if (!item.outcomeId || !item.outcomeTimestamp || !item.validatedOutcome) return undefined;
  return {
    source: item.source,
    ...(item.resourceType ? { resourceType: item.resourceType } : {}),
    ...(item.resourceId ? { resourceId: item.resourceId } : {}),
    timestamp: item.outcomeTimestamp,
    completionReference: item.progressReference,
    outcomeId: item.outcomeId,
    ...(item.sourceEventId ? { sourceEventId: item.sourceEventId } : {}),
    outcomeType: item.outcomeType,
    outcomeSource: item.outcomeSource,
    validatedOutcome: item.validatedOutcome,
    competencyIds: item.competencyIds,
    lineageStrength: item.lineageStrength,
    ...(item.metadata?.providerSource ? { providerSource: String(item.metadata.providerSource) } : {})
  };
}

function buildItem(
  score: CompetencyScoreAnalyticsRecord | undefined,
  competency: CompetencyRecord | undefined,
  competencyId: string,
  anchor: LearningAnchor,
  lineageItems: EvidenceLineageItem[],
  dateRange: ReturnType<typeof createAnalyticsDateRange>
): BeforeAfterCompetencyItem {
  // The analytics range is a hard read boundary. Do not use an older history
  // entry as a baseline when it falls outside the caller's bounded window.
  const observations = score
    ? getCompetencyHistoryObservations(score, { from: dateRange.from, to: anchor.timestamp })
    : [];
  const before = observations.filter((observation) => observation.observedAt < anchor.timestamp).at(-1);
  const after = score
    ? getCompetencyHistoryObservations(score, { to: dateRange.to }).find((observation) => observation.observedAt > anchor.timestamp)
    : undefined;
  const comparison = compareCompetencyObservations(before, after);
  const beforeEvidence = referencesForObservation(lineageItems, competencyId, before);
  const afterEvidence = referencesForObservation(lineageItems, competencyId, after);
  const learningEvidence = referencesDuringLearningPeriod(lineageItems, competencyId, anchor, after);
  const summary = evidenceSummary(beforeEvidence, learningEvidence, afterEvidence, (before ? 1 : 0) + (after ? 1 : 0));
  const lineage = {
    before: strengthOf(beforeEvidence),
    learningPeriod: strengthOf(learningEvidence),
    after: strengthOf(afterEvidence),
    overall: strongest([strengthOf(beforeEvidence), strengthOf(learningEvidence), strengthOf(afterEvidence)])
  };
  const limitations: string[] = [];
  if (!score) limitations.push("No persisted competency score exists for this learning anchor.");
  if (!before) {
    const hasOlderObservation = Boolean(score && getCompetencyHistoryObservations(score, { to: new Date(dateRange.from.getTime() - 1) }).length);
    limitations.push(hasOlderObservation
      ? "A possible baseline exists outside the bounded analysis range and was not queried."
      : "No reliable competency observation exists before the learning anchor.");
  }
  if (!after) limitations.push("No reliable competency observation exists after the learning anchor.");
  if (comparison.limitation) limitations.push(comparison.limitation);
  if (summary.unavailableEvidenceCount > 0) limitations.push("One or more before/after observations have no linked evidence in the selected range.");
  if (summary.validatedOutcomeCount > 0) limitations.push("Validated learning outcomes provide temporal context; causation is not established.");
  if (!anchor.competencyIds.includes(competencyId)) limitations.push("The anchor has no persisted mapping to this competency.");
  const frameworkSource = after || before;
  return {
    competencyId,
    ...(competency?.name ? { competencyName: competency.name } : {}),
    ...(competency?.code ? { competencyCode: competency.code } : {}),
    learningAnchor: anchor,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    observedChange: {
      ...(comparison.proficiencyDelta !== undefined ? { proficiencyDelta: comparison.proficiencyDelta } : {}),
      classification: comparison.classification
    },
    evidence: { before: beforeEvidence, learningPeriod: learningEvidence, after: afterEvidence },
    lineage,
    confidence: classifyImprovementConfidence((before ? 1 : 0) + (after ? 1 : 0), summary, comparison.classification),
    framework: {
      frameworkId: frameworkSource?.frameworkId,
      frameworkVersionId: frameworkSource?.frameworkVersionId,
      frameworkVersion: frameworkSource?.frameworkVersion,
      proficiencyScale: frameworkSource?.proficiencyScale,
      compatible: comparison.compatible
    },
    limitations: unique(limitations)
  };
}

/** Builds anchor-based before/after analysis without any persistence side effects. */
export function buildCompetencyBeforeAfter(
  scores: CompetencyScoreAnalyticsRecord[],
  competencies: CompetencyRecord[],
  lineageItems: EvidenceLineageItem[],
  dateRange: ReturnType<typeof createAnalyticsDateRange>,
  competencyId?: string
): CompetencyBeforeAfterResult {
  const anchorMap = new Map<string, LearningAnchor>();
  for (const item of lineageItems) {
    const anchor = buildAnchor(item);
    if (anchor) anchorMap.set(anchor.outcomeId, anchor);
  }
  const anchors = [...anchorMap.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const scoreById = new Map(scores.map((score) => [idOf(score.competencyId), score]));
  const competencyById = new Map(competencies.map((competency) => [idOf(competency._id), competency]));
  const items: BeforeAfterCompetencyItem[] = [];
  const limitations: string[] = [];
  for (const anchor of anchors) {
    if (!anchor.competencyIds.length) {
      limitations.push(`Learning outcome ${anchor.outcomeId} has no persisted competency mapping.`);
      continue;
    }
    for (const id of anchor.competencyIds) {
      if (competencyId && id !== competencyId) continue;
      items.push(buildItem(scoreById.get(id), competencyById.get(id), id, anchor, lineageItems, dateRange));
    }
  }
  if (!anchors.length) limitations.push("No validated learning outcome provides a reliable learning anchor in the selected range.");
  return { dateRange, anchors, items, limitations: unique(limitations) };
}

/** Read-only learner-scoped anchor-based temporal analysis. */
export async function getCompetencyBeforeAfter(userId: string, query: CompetencyBeforeAfterQuery = {}): Promise<CompetencyBeforeAfterResult> {
  const dateRange = createAnalyticsDateRange(query);
  const limit = Math.min(250, Math.max(1, Math.floor(query.limit || 100)));
  const scoreFilter = { userId, ...(query.competencyId ? { competencyId: query.competencyId } : {}) };
  const scores = await CompetencyScoreModel.find(scoreFilter)
    .select("_id competencyId currentLevel frameworkId frameworkVersionId frameworkVersion proficiencyScale history evidence")
    .limit(limit)
    .lean() as unknown as CompetencyScoreAnalyticsRecord[];
  const competencyIds = scores.map((score) => idOf(score.competencyId)).filter(Boolean);
  const competencies = competencyIds.length
    ? await CompetencyModel.find({ _id: { $in: competencyIds } }).select("_id name code").lean() as unknown as CompetencyRecord[]
    : [];
  const lineage = await getEvidenceLineage(userId, { ...query, from: dateRange.from, to: dateRange.to, limit: 250 });
  return buildCompetencyBeforeAfter(scores, competencies, lineage.items, dateRange, query.competencyId);
}
