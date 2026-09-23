import {
  CompetencyModel,
  DepartmentModel,
  IntegrationStatusModel,
  PlatformCourseModel,
  RoleRequirementModel,
  SystemSettingsModel
} from "../models/sih/SihModels";
import { ensureLegacyFrameworkVersion, LEGACY_FRAMEWORK_ID, LEGACY_FRAMEWORK_VERSION, LEGACY_SOURCE_ID } from "../services/framework.service";
import { UserModel } from "../models/User";
import { LectureModel } from "../models/Lecture";
import { TranscriptModel } from "../models/LearningModels";
import { buildContentSource, chunkContent } from "../services/content-intelligence.service";
import { fetchYoutubeOEmbed, fetchYoutubeTranscriptPlan, extractYoutubeVideoId } from "../services/youtube.service";

const COMPETENCIES: Array<{
  code: string;
  name: string;
  category: "statistical" | "technical" | "digital_governance" | "behavioural_managerial";
  keywords: string[];
}> = [
  { code: "STAT_SURVEY", name: "Survey Design", category: "statistical", keywords: ["survey", "questionnaire", "sampling frame"] },
  { code: "STAT_SAMPLING", name: "Sampling", category: "statistical", keywords: ["sample", "stratified", "cluster"] },
  { code: "STAT_NA", name: "National Accounts", category: "statistical", keywords: ["gdp", "national accounts", "sna"] },
  { code: "STAT_PRICE", name: "Price Statistics", category: "statistical", keywords: ["cpi", "wpi", "price index"] },
  { code: "STAT_LABOUR", name: "Labour Statistics", category: "statistical", keywords: ["labour", "employment", "plfs"] },
  { code: "STAT_AGRI", name: "Agricultural Statistics", category: "statistical", keywords: ["agriculture", "crop", "yield"] },
  { code: "STAT_IND", name: "Industrial Statistics", category: "statistical", keywords: ["industry", "asi", "iip"] },
  { code: "STAT_SDG", name: "SDG Indicators", category: "statistical", keywords: ["sdg", "indicator", "sustainable"] },
  { code: "STAT_META", name: "Metadata Standards", category: "statistical", keywords: ["metadata", "ddi", "gsbpm"] },
  { code: "STAT_DQ", name: "Data Quality Frameworks", category: "statistical", keywords: ["data quality", "dqaf", "validation"] },
  { code: "TECH_PYTHON", name: "Python", category: "technical", keywords: ["python", "pandas", "numpy"] },
  { code: "TECH_R", name: "R", category: "technical", keywords: ["r language", "tidyverse"] },
  { code: "TECH_SQL", name: "SQL", category: "technical", keywords: ["sql", "database", "query"] },
  { code: "TECH_STATA", name: "Stata", category: "technical", keywords: ["stata"] },
  { code: "TECH_SPSS", name: "SPSS", category: "technical", keywords: ["spss"] },
  { code: "TECH_SAS", name: "SAS", category: "technical", keywords: ["sas"] },
  { code: "TECH_GIS", name: "GIS", category: "technical", keywords: ["gis", "geospatial", "qgis"] },
  { code: "TECH_VIZ", name: "Data Visualization", category: "technical", keywords: ["visualization", "dashboard", "chart"] },
  { code: "TECH_AI", name: "Artificial Intelligence", category: "technical", keywords: ["ai", "artificial intelligence"] },
  { code: "TECH_ML", name: "Machine Learning", category: "technical", keywords: ["machine learning", "ml", "model"] },
  { code: "TECH_CLOUD", name: "Cloud Computing", category: "technical", keywords: ["cloud", "aws", "azure", "gcp"] },
  { code: "TECH_API", name: "APIs", category: "technical", keywords: ["api", "rest", "integration"] },
  { code: "TECH_OPEN", name: "Open Data", category: "technical", keywords: ["open data", "opendata"] },
  { code: "TECH_DS", name: "Data Science", category: "technical", keywords: ["data science", "analytics"] },
  { code: "TECH_BD", name: "Big Data Analytics", category: "technical", keywords: ["big data", "spark", "hadoop"] },
  { code: "TECH_AUTO", name: "Automation", category: "technical", keywords: ["automation", "etl", "pipeline"] },
  { code: "DG_CYBER", name: "Cybersecurity", category: "digital_governance", keywords: ["cybersecurity", "security"] },
  { code: "DG_PRIVACY", name: "Data Privacy", category: "digital_governance", keywords: ["privacy", "pdpa", "gdpr"] },
  { code: "DG_DSIGN", name: "Digital Signatures", category: "digital_governance", keywords: ["digital signature", "dsc"] },
  { code: "DG_GCLOUD", name: "Government Cloud", category: "digital_governance", keywords: ["meghraj", "government cloud"] },
  { code: "DG_DPI", name: "Digital Public Infrastructure", category: "digital_governance", keywords: ["dpi", "aadhaar", "upi"] },
  { code: "BM_LEAD", name: "Leadership", category: "behavioural_managerial", keywords: ["leadership"] },
  { code: "BM_COMM", name: "Communication", category: "behavioural_managerial", keywords: ["communication"] },
  { code: "BM_PM", name: "Project Management", category: "behavioural_managerial", keywords: ["project management", "pmp"] },
  { code: "BM_ETHICS", name: "Ethics", category: "behavioural_managerial", keywords: ["ethics", "integrity"] },
  { code: "BM_DECIDE", name: "Decision Making", category: "behavioural_managerial", keywords: ["decision making"] },
  { code: "BM_CHANGE", name: "Change Management", category: "behavioural_managerial", keywords: ["change management"] }
];

const PLATFORM_COURSES = [
  {
    code: "PLAT_SQL_FUND",
    title: "SQL Fundamentals for Official Statistics",
    description: "Introductory SQL for statistical data processing and query validation.",
    difficulty: "beginner" as const,
    durationHours: 8,
    competencyCodes: ["TECH_SQL"],
    keywords: ["sql", "database"],
    catalogType: "platform" as const,
    provider: "AARAMBH Platform Catalog"
  },
  {
    code: "PLAT_SQL_STAT",
    title: "SQL for Statistical Data Pipelines",
    description: "Intermediate SQL patterns for survey microdata and administrative datasets.",
    difficulty: "intermediate" as const,
    durationHours: 12,
    competencyCodes: ["TECH_SQL", "STAT_DQ"],
    keywords: ["sql", "data quality"],
    catalogType: "platform" as const,
    provider: "AARAMBH Platform Catalog"
  },
  {
    code: "PLAT_PYTHON_FUND",
    title: "Python for Statistical Computing",
    description: "Python basics with pandas for cleaning and exploring statistical datasets.",
    difficulty: "beginner" as const,
    durationHours: 10,
    competencyCodes: ["TECH_PYTHON", "TECH_DS"],
    keywords: ["python", "pandas"],
    catalogType: "platform" as const,
    provider: "AARAMBH Platform Catalog"
  },
  {
    code: "PLAT_SURVEY",
    title: "Survey Design Essentials",
    description: "Core principles of survey design for official statistics.",
    difficulty: "intermediate" as const,
    durationHours: 14,
    competencyCodes: ["STAT_SURVEY", "STAT_SAMPLING"],
    keywords: ["survey", "sampling"],
    catalogType: "platform" as const,
    provider: "AARAMBH Platform Catalog"
  },
  {
    code: "PLAT_SDG",
    title: "SDG Indicator Framework Orientation",
    description: "Understanding SDG indicator production and metadata.",
    difficulty: "intermediate" as const,
    durationHours: 6,
    competencyCodes: ["STAT_SDG", "STAT_META"],
    keywords: ["sdg", "indicators"],
    catalogType: "platform" as const,
    provider: "AARAMBH Platform Catalog"
  },
  {
    code: "NSSTA_SAMPLE_TPAC",
    title: "TPAC-Oriented: Sampling Methods Refreshers",
    description:
      "Local catalogue entry aligned to typical NSSTA TPAC sampling themes. Not a live NSSTA feed.",
    difficulty: "intermediate" as const,
    durationHours: 20,
    competencyCodes: ["STAT_SAMPLING", "STAT_SURVEY"],
    keywords: ["sampling", "tpac", "nssta"],
    catalogType: "nssta_mirror" as const,
    provider: "Platform TPAC-Oriented Catalogue"
  },
  {
    code: "NSSTA_NA_TPAC",
    title: "TPAC-Oriented: National Accounts Methods",
    description:
      "Local catalogue entry for national accounts capacity building. Not a live NSSTA feed.",
    difficulty: "advanced" as const,
    durationHours: 30,
    competencyCodes: ["STAT_NA"],
    keywords: ["national accounts", "tpac"],
    catalogType: "nssta_mirror" as const,
    provider: "Platform TPAC-Oriented Catalogue"
  },
  {
    code: "PLAT_DATA_PRIVACY",
    title: "Data Privacy for Statistical Releases",
    description: "Privacy, disclosure control, and secure handling of microdata.",
    difficulty: "intermediate" as const,
    durationHours: 6,
    competencyCodes: ["DG_PRIVACY", "DG_CYBER"],
    keywords: ["privacy", "security"],
    catalogType: "platform" as const,
    provider: "AARAMBH Platform Catalog"
  }
];

const DEMO_CATALOG = [
  { code: "DEMO_STATISTICS_FUNDAMENTALS", title: "Statistics Fundamentals", description: "Foundations of sampling, data quality, and statistical reasoning for official statistics.", difficulty: "beginner" as const, durationHours: 8, competencyCodes: ["STAT_SAMPLING", "STAT_DQ"], keywords: ["statistics", "sampling", "data quality"], catalogType: "platform" as const, provider: "ARAMBH Demo Catalog" },
  { code: "DEMO_PYTHON_DATA_ANALYSIS", title: "Python for Data Analysis", description: "Practical Python and pandas concepts for preparing and inspecting statistical datasets.", difficulty: "beginner" as const, durationHours: 10, competencyCodes: ["TECH_PYTHON", "TECH_DS"], keywords: ["python", "pandas", "data analysis"], catalogType: "platform" as const, provider: "ARAMBH Demo Catalog" },
  { code: "DEMO_MACHINE_LEARNING_FUNDAMENTALS", title: "Machine Learning Fundamentals", description: "Introductory supervised learning, model evaluation, and regression for public-sector data work.", difficulty: "intermediate" as const, durationHours: 12, competencyCodes: ["TECH_ML", "TECH_DS"], keywords: ["machine learning", "regression", "supervised learning"], catalogType: "platform" as const, provider: "ARAMBH Demo Catalog" },
  { code: "DEMO_DATA_VISUALIZATION", title: "Data Visualization for Government Dashboards", description: "Principles for clear statistical charts, dashboards, and responsible interpretation.", difficulty: "intermediate" as const, durationHours: 8, competencyCodes: ["TECH_VIZ", "STAT_DQ"], keywords: ["data visualization", "charts", "dashboard"], catalogType: "platform" as const, provider: "ARAMBH Demo Catalog" }
];

const DEMO_LECTURES = [
  { key: "demo-stat-sampling", course: "DEMO_STATISTICS_FUNDAMENTALS", title: "Introduction to Sampling", text: "Sampling is the process of selecting a representative subset from a population for statistical analysis. A well-designed sample allows researchers to estimate population characteristics while reducing the time and resources required for data collection.\n\nProbability sampling gives each unit a known chance of selection. Simple random sampling, stratified sampling, and cluster sampling are useful designs, but each requires a clear sampling frame and documented inclusion rules. The sample size should reflect the expected variability, the desired precision, and the available field resources.\n\nA confidence interval communicates uncertainty around an estimate. It should not be interpreted as a guarantee that a particular population value lies inside the interval. Analysts should report the sampling design, weighting approach, and response rate alongside the estimate." },
  { key: "demo-stat-population", course: "DEMO_STATISTICS_FUNDAMENTALS", title: "Population, Sample, and Data Quality", text: "The target population is the complete group about which a statistical study intends to make statements. The sample is the subset observed in practice. Coverage error occurs when the sampling frame does not represent the target population, while non-response can introduce bias when responding units differ systematically from non-responding units.\n\nData quality is multidimensional. Accuracy, timeliness, coherence, accessibility, and relevance should be considered together. A validation rule may identify a missing value or an impossible age, but a clean-looking dataset is not automatically accurate. Every correction should be documented so that the transformation remains auditable." },
  { key: "demo-stat-official", course: "DEMO_STATISTICS_FUNDAMENTALS", title: "Reading Statistical Estimates", text: "Official statistics should communicate definitions, reference periods, units, and limitations clearly. A rate of 12.5 percent is meaningful only when the numerator, denominator, population, and time period are known. Rounding can improve readability, but it must not create a false impression of precision.\n\nWhen comparing two estimates, analysts should consider confidence intervals, design effects, and changes in methodology. A difference between point estimates is not by itself proof of a meaningful change. Reproducible tables and metadata help reviewers understand how the published result was produced." },
  { key: "demo-python-basics", course: "DEMO_PYTHON_DATA_ANALYSIS", title: "Python Basics for Data Work", text: "Python is a general-purpose programming language widely used for data analysis. Variables hold values, functions group reusable operations, and lists or dictionaries organize collections of records. Clear names and small functions make analytical code easier to review.\n\nA typical workflow loads data, checks its shape and types, validates important fields, and records each transformation. For example:\n\n```python\nimport pandas as pd\ndata = pd.read_csv(\"survey.csv\")\nprint(data.shape)\n```\n\nThe code should remain executable code; explanatory text may describe what it does without changing identifiers or file paths." },
  { key: "demo-python-pandas", course: "DEMO_PYTHON_DATA_ANALYSIS", title: "Data Handling with pandas", text: "The pandas library provides DataFrame structures for tabular data. Analysts commonly select columns, filter rows, group observations, and calculate summaries. A groupby operation should be paired with a clearly defined aggregation and a documented treatment of missing values.\n\nBefore analysis, inspect duplicate keys, unexpected categories, date formats, and numeric ranges. Do not silently replace missing values with zero when zero has a different meaning. Preserve the original dataset and write a new derived table when cleaning is required." },
  { key: "demo-python-reproducibility", course: "DEMO_PYTHON_DATA_ANALYSIS", title: "Reproducible Analysis", text: "Reproducible analysis means that another analyst can understand the source data, environment, code, and decisions used to produce a result. Record the dataset version, processing date, Python package versions, and important assumptions.\n\nA notebook can support exploration, but a production workflow should also separate configuration from code and include validation checks. A dashboard value should be traceable to a defined query or transformation rather than copied manually from an intermediate file." },
  { key: "demo-ml-intro", course: "DEMO_MACHINE_LEARNING_FUNDAMENTALS", title: "Introduction to Machine Learning", text: "Machine Learning uses data to learn patterns that support a defined task. In supervised learning, a model learns from examples that contain a target label. The training set is used to fit the model, while validation and test sets help estimate how well it generalizes to new observations.\n\nA model is not automatically objective because it uses mathematics. Sampling bias, missing values, measurement choices, and the target definition can affect results. Public-sector deployments require documentation, human review, and monitoring for data drift and unequal error patterns." },
  { key: "demo-ml-supervised", course: "DEMO_MACHINE_LEARNING_FUNDAMENTALS", title: "Supervised Learning Workflow", text: "A supervised learning workflow starts by defining the prediction or classification task and the unit of analysis. Features should be available at the time a prediction would be made; using future information creates leakage. Split data in a way that reflects the real deployment setting, especially when records are grouped by district, household, or time.\n\nAccuracy, precision, recall, and mean absolute error answer different questions. Select metrics that match the decision context, report a baseline, and inspect errors rather than presenting one number as a complete evaluation." },
  { key: "demo-ml-regression", course: "DEMO_MACHINE_LEARNING_FUNDAMENTALS", title: "Regression Basics", text: "Regression estimates a relationship between an outcome and one or more explanatory variables. In a simple linear model, the fitted line is often written as y = beta_0 + beta_1 x + error. The coefficient beta_1 describes the expected change in y associated with a one-unit change in x under the model assumptions.\n\nCorrelation is not causation. Residual analysis, sensitivity checks, and domain knowledge are needed before interpreting a model. A regression result should include the population, time period, variables, missing-data treatment, and uncertainty information." },
  { key: "demo-viz-charts", course: "DEMO_DATA_VISUALIZATION", title: "Choosing Statistical Charts", text: "A chart should answer a specific question. Use a line chart for change over time, a bar chart for comparisons between categories, and a histogram to inspect the distribution of a numeric variable. A pie chart is difficult to read when there are many small categories.\n\nLabel units, time periods, denominators, and data sources. Avoid truncated axes when they exaggerate differences. Colour should support a pattern that is also explained with text, because not every reader distinguishes colours in the same way." },
  { key: "demo-viz-dashboard", course: "DEMO_DATA_VISUALIZATION", title: "Dashboard Fundamentals", text: "A government dashboard should help a defined audience make a decision. Begin with a small set of reliable indicators, show the latest period and comparison period when both are available, and explain missing or suppressed values. A completion count is an engagement measure; it is not a competency observation.\n\nUse filters consistently and display the selected date range. Tables or accessible summaries should accompany important visualizations so that exact values are not hidden in a tooltip." },
  { key: "demo-viz-interpretation", course: "DEMO_DATA_VISUALIZATION", title: "Responsible Interpretation", text: "Visualization can reveal patterns, but it cannot establish a causal claim by itself. A higher completion rate may reflect different enrollment patterns, course availability, or reporting practices. When evidence is insufficient, label it as insufficient rather than converting the missing value to zero.\n\nDocument the source, version, calculation, and limitations of every indicator. This makes an analytical product more trustworthy and gives reviewers a clear path to reproduce the displayed result." }
];

const DEFAULT_JOB_ROLES: Array<{ jobRole: string; requirements: Array<{ code: string; level: number }> }> = [
  {
    jobRole: "Statistical Officer",
    requirements: [
      { code: "STAT_SURVEY", level: 4 },
      { code: "STAT_SAMPLING", level: 4 },
      { code: "STAT_DQ", level: 4 },
      { code: "TECH_SQL", level: 3 },
      { code: "TECH_PYTHON", level: 3 },
      { code: "STAT_META", level: 3 },
      { code: "BM_COMM", level: 3 }
    ]
  },
  {
    jobRole: "Data Analyst",
    requirements: [
      { code: "TECH_SQL", level: 4 },
      { code: "TECH_PYTHON", level: 4 },
      { code: "TECH_VIZ", level: 4 },
      { code: "TECH_DS", level: 4 },
      { code: "STAT_DQ", level: 3 },
      { code: "TECH_ML", level: 3 }
    ]
  },
  {
    jobRole: "Survey Supervisor",
    requirements: [
      { code: "STAT_SURVEY", level: 5 },
      { code: "STAT_SAMPLING", level: 4 },
      { code: "BM_LEAD", level: 4 },
      { code: "BM_PM", level: 3 },
      { code: "STAT_DQ", level: 4 }
    ]
  }
];

export async function seedSihFoundation() {
  const legacyFramework = await ensureLegacyFrameworkVersion();
  const competencyCount = await CompetencyModel.countDocuments();
  if (competencyCount === 0) {
    await CompetencyModel.insertMany(
      COMPETENCIES.map((c) => ({
        ...c,
        description: `${c.name} competency for India's Official Statistical System.`,
        isActive: true,
        frameworkId: LEGACY_FRAMEWORK_ID,
        frameworkVersionId: legacyFramework.framework._id,
        frameworkVersion: LEGACY_FRAMEWORK_VERSION,
        sourceId: LEGACY_SOURCE_ID,
        sourceReference: "application-defined://legacy-framework",
        proficiencyScale: "internal_0_5"
      }))
    );
    console.log(`Seeded ${COMPETENCIES.length} competencies`);
  }

  if ((await DepartmentModel.countDocuments()) === 0) {
    await DepartmentModel.insertMany([
      {
        name: "National Statistical Office",
        code: "NSO",
        description: "Central statistical organisation",
        organization: "Ministry of Statistics and Programme Implementation"
      },
      {
        name: "NSSTA",
        code: "NSSTA",
        description: "National Statistical Systems Training Academy",
        organization: "MoSPI"
      },
      {
        name: "State DES",
        code: "DES",
        description: "Directorate of Economics and Statistics",
        organization: "State Government"
      }
    ]);
  }

  for (const course of [...PLATFORM_COURSES, ...DEMO_CATALOG]) {
    await PlatformCourseModel.findOneAndUpdate(
      { code: course.code },
      { $setOnInsert: course },
      { upsert: true, new: true }
    );
  }

  const demoOwner = await UserModel.findOne({ $or: [{ role: "admin" }, { roles: "admin" }] }).select("_id").lean();
  if (demoOwner) {
    const lectureIdsByCourse = new Map<string, any[]>();
    for (const spec of DEMO_LECTURES) {
      const source = buildContentSource({ sourceType: "lecture", sourceId: spec.key, title: spec.title, text: spec.text, language: "en", provider: "ARAMBH Demo Catalog" });
      const lecture = await LectureModel.findOneAndUpdate(
        { demoKey: spec.key },
        {
          $set: {
            userId: demoOwner._id,
            demoKey: spec.key,
            title: spec.title,
            sourceType: "transcript",
            transcript: spec.text,
            language: "English",
            status: "processed",
            educationalClassification: "EDUCATIONAL",
            educationalConfidence: 100,
            educationalReasoning: "Curated ARAMBH demonstration learning material."
          }
        },
        { upsert: true, new: true }
      );
      const chunks = chunkContent(spec.text, { sourceId: String(lecture._id), sourceType: "lecture", title: spec.title, language: "en", provider: "ARAMBH Demo Catalog" })
        .map((chunk, index) => ({ ...chunk, startSec: index * 60, endSec: index * 60 + 60, embeddingId: chunk.chunkId }));
      await TranscriptModel.findOneAndUpdate(
        { lectureId: lecture._id, contentVersion: source.contentVersion },
        { $set: { lectureId: lecture._id, sourceType: "demo_catalog", sourceId: spec.key, contentHash: source.contentHash, contentVersion: source.contentVersion, language: "en", provider: "ARAMBH Demo Catalog", ingestedAt: new Date(), chunks } },
        { upsert: true, new: true }
      );
      const ids = lectureIdsByCourse.get(spec.course) || [];
      ids.push(lecture._id);
      lectureIdsByCourse.set(spec.course, ids);
    }
    for (const [course, lectureIds] of lectureIdsByCourse) {
      await PlatformCourseModel.updateOne({ code: course }, { $addToSet: { lectureIds: { $each: lectureIds } } });
    }

    const optionalYoutubeUrl = String(process.env.DEMO_YOUTUBE_URL || "").trim();
    if (optionalYoutubeUrl && !await LectureModel.exists({ demoKey: "demo-youtube" })) {
      const videoId = extractYoutubeVideoId(optionalYoutubeUrl);
      if (videoId) {
        try {
          const [meta, plan] = await Promise.all([fetchYoutubeOEmbed(videoId), fetchYoutubeTranscriptPlan(videoId)]);
          const title = `Optional YouTube Demo: ${meta.title}`;
          const lecture = await LectureModel.create({ demoKey: "demo-youtube", userId: demoOwner._id, title, sourceType: "youtube", sourceUrl: `https://www.youtube.com/watch?v=${videoId}`, thumbnailUrl: meta.thumbnailUrl, channelTitle: meta.channelTitle, transcript: plan.fullText, language: "English", durationSec: plan.durationSec, status: "processed", educationalClassification: "EDUCATIONAL", educationalConfidence: 100, educationalReasoning: "Optional public YouTube transcript supplied for local demonstration." });
          const source = buildContentSource({ sourceType: "youtube", sourceId: String(lecture._id), title, text: plan.fullText, language: "en", provider: "YouTube public transcript", sourceUrl: lecture.sourceUrl });
          const chunks = chunkContent(plan.fullText, { sourceId: String(lecture._id), sourceType: "youtube", title, language: "en", provider: "YouTube public transcript" }).map((chunk, index) => ({ ...chunk, startSec: index * 60, endSec: index * 60 + 60, embeddingId: chunk.chunkId }));
          await TranscriptModel.create({ lectureId: lecture._id, sourceType: "youtube", sourceId: String(lecture._id), contentHash: source.contentHash, contentVersion: source.contentVersion, language: "en", provider: "YouTube public transcript", sourceUrl: lecture.sourceUrl, ingestedAt: new Date(), chunks });
          await PlatformCourseModel.updateOne({ code: "DEMO_DATA_VISUALIZATION" }, { $addToSet: { lectureIds: lecture._id } });
          console.log("Added optional public YouTube demo lecture to DEMO_DATA_VISUALIZATION.");
        } catch (error) {
          console.warn("Optional YouTube demo was not added:", error instanceof Error ? error.message : error);
        }
      } else {
        console.warn("DEMO_YOUTUBE_URL is not a supported public YouTube URL; optional demo skipped.");
      }
    }
    console.log(`Ensured ${DEMO_LECTURES.length} English demo lectures across ${DEMO_CATALOG.length} platform courses`);
  } else {
    console.warn("Demo catalog courses are available, but demo lecture content is deferred until an admin account exists.");
  }

  if ((await RoleRequirementModel.countDocuments()) === 0) {
    const comps = await CompetencyModel.find({}).lean();
    const byCode = new Map(comps.map((c) => [c.code, c._id]));
    const docs = [];
    for (const role of DEFAULT_JOB_ROLES) {
      for (const req of role.requirements) {
        const competencyId = byCode.get(req.code);
        if (!competencyId) continue;
        docs.push({
          jobRole: role.jobRole,
          competencyId,
          requiredLevel: req.level,
          priorityWeight: 1,
          frameworkId: LEGACY_FRAMEWORK_ID,
          frameworkVersionId: legacyFramework.framework._id,
          frameworkVersion: LEGACY_FRAMEWORK_VERSION,
          sourceId: LEGACY_SOURCE_ID,
          sourceReference: "application-defined://legacy-framework"
        });
      }
    }
    if (docs.length) await RoleRequirementModel.insertMany(docs);
  }

  const byCode = new Map((await CompetencyModel.find({}).select("_id code").lean()).map((c) => [c.code, c._id]));
  const contextualRequirements = [
    { jobRole: "Statistical Officer", departmentCode: "NSO", assignment: "Survey Operations", code: "STAT_SURVEY", requiredLevel: 4 },
    { jobRole: "Statistical Officer", departmentCode: "NSO", assignment: "Survey Operations", code: "STAT_SAMPLING", requiredLevel: 4 },
    { jobRole: "Data Analyst", departmentCode: "DES", assignment: "Data Quality and Visualization", code: "TECH_SQL", requiredLevel: 4 },
    { jobRole: "Data Analyst", departmentCode: "DES", assignment: "Data Quality and Visualization", code: "TECH_VIZ", requiredLevel: 4 },
    { jobRole: "Survey Supervisor", departmentCode: "NSSTA", assignment: "Training and Capacity Building", code: "BM_LEAD", requiredLevel: 4 }
  ];
  for (const item of contextualRequirements) {
    const competencyId = byCode.get(item.code);
    if (!competencyId) continue;
    await RoleRequirementModel.findOneAndUpdate(
      { jobRole: item.jobRole, departmentCode: item.departmentCode, assignment: item.assignment, competencyId, frameworkVersionId: legacyFramework.framework._id },
      {
        ...item,
        competencyId,
        roleContext: "current",
        frameworkId: LEGACY_FRAMEWORK_ID,
        frameworkVersionId: legacyFramework.framework._id,
        frameworkVersion: LEGACY_FRAMEWORK_VERSION,
        sourceId: LEGACY_SOURCE_ID,
        sourceReference: "application-defined://legacy-framework"
      },
      { upsert: true, new: true }
    );
  }

  await SystemSettingsModel.findOneAndUpdate(
    { key: "learning_percentage_weights" },
    {
      key: "learning_percentage_weights",
      value: {
        courseCompletion: 0.2,
        assessmentPerformance: 0.25,
        competencyAchievement: 0.25,
        trainingCompletion: 0.1,
        quizPerformance: 0.15,
        learningHoursScore: 0.05
      }
    },
    { upsert: true }
  );

  await SystemSettingsModel.findOneAndUpdate(
    { key: "competency_level_labels" },
    {
      key: "competency_level_labels",
      value: {
        1: "Beginner",
        2: "Basic",
        3: "Intermediate",
        4: "Advanced",
        5: "Expert"
      }
    },
    { upsert: true }
  );

  await IntegrationStatusModel.findOneAndUpdate(
    { name: "igot" },
    {
      name: "igot",
      status: "not_configured",
      message: "Checked at startup; live status refreshed via /api/integrations/status",
      lastCheckedAt: new Date()
    },
    { upsert: true }
  );

  await IntegrationStatusModel.findOneAndUpdate(
    { name: "nssta" },
    {
      name: "nssta",
      status: "not_configured",
      message: "Checked at startup; live status refreshed via /api/integrations/status",
      lastCheckedAt: new Date()
    },
    { upsert: true }
  );
}
