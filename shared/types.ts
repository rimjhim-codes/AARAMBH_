export type Plan = "free" | "pro" | "institution";

export type EducationalClassification =
  | "EDUCATIONAL"
  | "PARTIALLY_EDUCATIONAL"
  | "NON_EDUCATIONAL";

export interface EducationalInsight {
  classification: EducationalClassification;
  confidence: number;
  reasoning: string;
}

export interface TopicConfidence {
  topic: string;
  confidenceScore: number;
}

export interface TutorResponse {
  chatSessionId: string;
  answer: string;
  references: Array<{ text: string; startSec: number; endSec: number }>;
}
