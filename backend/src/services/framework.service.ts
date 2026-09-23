import { Types } from "mongoose";
import {
  CompetencyModel,
  FrameworkVersionModel,
  INTERNAL_PROFICIENCY_LEVELS,
  RoleRequirementModel,
  SourceRegistryModel
} from "../models/sih/SihModels";

export const LEGACY_FRAMEWORK_ID = "aarambh-application-defined";
export const LEGACY_FRAMEWORK_VERSION = "1.0";
export const LEGACY_FRAMEWORK_NAME = "ARAMBH Application-Defined Competency Framework";
export const LEGACY_SOURCE_ID = "aarambh-application-defined-source";

export async function ensureLegacyFrameworkVersion() {
  const source = await SourceRegistryModel.findOneAndUpdate(
    { sourceId: LEGACY_SOURCE_ID },
    {
      $setOnInsert: {
        sourceId: LEGACY_SOURCE_ID,
        title: "ARAMBH application-defined source",
        sourceType: "internal_application_definition",
        reference: "application-defined://legacy-framework",
        authority: "ARAMBH application-defined; not a Government of India authority",
        status: "approved",
        frameworkId: LEGACY_FRAMEWORK_ID,
        frameworkVersion: LEGACY_FRAMEWORK_VERSION,
        notes: "Compatibility source for the pre-authoritative application framework."
      }
    },
    { upsert: true, new: true }
  );

  const framework = await FrameworkVersionModel.findOneAndUpdate(
    { frameworkId: LEGACY_FRAMEWORK_ID, version: LEGACY_FRAMEWORK_VERSION },
    {
      $setOnInsert: {
        frameworkId: LEGACY_FRAMEWORK_ID,
        frameworkName: LEGACY_FRAMEWORK_NAME,
        version: LEGACY_FRAMEWORK_VERSION,
        status: "draft",
        sourceId: LEGACY_SOURCE_ID,
        sourceReference: "application-defined://legacy-framework",
        description: "Legacy application-owned competency framework. It is not an official Government of India framework.",
        notes: "Keep readable for compatibility until an authoritative framework is supplied.",
        proficiencyScale: "internal_0_5",
        proficiencyMinimum: 0,
        proficiencyMaximum: 5,
        proficiencyLevels: INTERNAL_PROFICIENCY_LEVELS
      }
    },
    { upsert: true, new: true }
  );

  await CompetencyModel.updateMany(
    { $or: [{ frameworkId: { $exists: false } }, { frameworkId: "" }] },
    {
      $set: {
        frameworkId: LEGACY_FRAMEWORK_ID,
        frameworkVersionId: framework._id,
        frameworkVersion: LEGACY_FRAMEWORK_VERSION,
        sourceId: LEGACY_SOURCE_ID,
        sourceReference: "application-defined://legacy-framework",
        proficiencyScale: "internal_0_5",
        proficiencyMinimum: 0,
        proficiencyMaximum: 5,
        proficiencyLevels: INTERNAL_PROFICIENCY_LEVELS
      }
    }
  );

  await RoleRequirementModel.updateMany(
    { $or: [{ frameworkId: { $exists: false } }, { frameworkId: "" }] },
    {
      $set: {
        frameworkId: LEGACY_FRAMEWORK_ID,
        frameworkVersionId: framework._id,
        frameworkVersion: LEGACY_FRAMEWORK_VERSION,
        roleContext: "current",
        targetRole: "",
        sourceId: LEGACY_SOURCE_ID,
        sourceReference: "application-defined://legacy-framework"
      }
    }
  );

  return { framework, source };
}

export function isFrameworkEditable(status: string) {
  return status === "draft" || status === "review";
}

export function canTransitionFrameworkStatus(from: string, to: string) {
  if (from === to) return true;
  return (
    (from === "draft" && to === "review") ||
    (from === "review" && to === "approved") ||
    (from === "approved" && to === "published") ||
    (from === "published" && to === "retired")
  );
}

export function canTransitionSourceStatus(from: string, to: string) {
  if (from === to) return true;
  return (
    (from === "draft" && to === "pending_review") ||
    (from === "pending_review" && to === "approved") ||
    (from === "approved" && to === "retired")
  );
}

export async function getLegacyFrameworkVersion() {
  return FrameworkVersionModel.findOne({
    frameworkId: LEGACY_FRAMEWORK_ID,
    version: LEGACY_FRAMEWORK_VERSION
  });
}

export function validObjectId(value: string) {
  return Types.ObjectId.isValid(value);
}
