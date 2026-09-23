import { VirtualLabCompletionModel } from "../models/VirtualLabCompletion";
import { VirtualLabAttemptModel } from "../models/VirtualLabAttempt";
import { VirtualLabAttemptCounterModel } from "../models/VirtualLabAttemptCounter";
import { LearningProgressModel } from "../models/LearningProgress";
import { recordLearningOutcome } from "./learning-outcome.service";
import { processLearningOutcome } from "./learning-outcome-coordinator.service";
import { CompetencyModel } from "../models/sih/SihModels";
import { spawn } from "node:child_process";
import { updateLectureProgress, upsertLearningProgress } from "./learning-progress.service";
import { recordLearningActivity } from "./performance.service";

export const VIRTUAL_LAB_CATEGORIES = ["AI", "Data Science", "Cloud Computing", "Cybersecurity", "Automation", "Statistics"] as const;
export type VirtualLabCategory = (typeof VIRTUAL_LAB_CATEGORIES)[number];
const virtualLabCategorySet = new Set<string>(VIRTUAL_LAB_CATEGORIES);

export function validateVirtualLabCategory(category: unknown): VirtualLabCategory | undefined {
  if (category === undefined || category === null || category === "") return undefined;
  if (typeof category !== "string" || !virtualLabCategorySet.has(category)) {
    throw new Error(`Unsupported virtual lab category: ${String(category)}`);
  }
  return category as VirtualLabCategory;
}

type Lab = {
  id: string;
  title: string;
  type: "code" | "scenario";
  category?: VirtualLabCategory;
  competencyCode: string;
  competency: string;
  difficulty: "Beginner" | "Intermediate";
  minutes: number;
  description: string;
  learningObjectives?: string[];
  prerequisites?: string[];
  scenario?: string;
  task?: string;
  expectedOutcome?: string;
  hints?: string[];
  references?: Array<{ title: string; url?: string }>;
  validationCriteria?: string[];
  instructions: string[];
  starterCode?: string;
  checks?: string[];
  expectedOutput?: string;
  checkpoints?: Array<{ id: string; prompt: string; options: string[]; answer: string; explanation: string }>;
};

export const VIRTUAL_LABS: Lab[] = [
  {
    id: "ai-output-evaluation",
    title: "Evaluate AI-generated outputs",
    type: "scenario",
    category: "AI",
    competencyCode: "TECH_AI",
    competency: "Artificial Intelligence",
    difficulty: "Beginner",
    minutes: 12,
    description: "Evaluate simulated AI outputs for factual support, relevance, and privacy risk.",
    learningObjectives: ["Identify unsupported claims", "Assess relevance to a task", "Recognize privacy-sensitive output"],
    scenario: "You are reviewing simulated AI-assisted summaries before they are used in an internal statistics workflow.",
    task: "Select the quality and safety judgement that best describes each simulated output.",
    expectedOutcome: "AI output is reviewed against explicit quality and safety criteria before use.",
    hints: ["Check whether a claim is supported and whether sensitive information is exposed."],
    validationCriteria: ["All AI evaluation criteria selected correctly"],
    instructions: ["Inspect each simulated output description.", "Apply the quality and safety criteria.", "Submit all evaluation checkpoints."],
    checkpoints: [
      { id: "unsupported", prompt: "An output states a precise trend but cites no source or data. What is the correct judgement?", options: ["Accept it because it sounds plausible", "Flag it as an unsupported claim requiring verification", "Publish it immediately"], answer: "Flag it as an unsupported claim requiring verification", explanation: "Specific claims require evidence and verification before use." },
      { id: "relevance", prompt: "An output answers a different question from the one asked. What should happen?", options: ["Treat it as relevant anyway", "Flag it as not relevant and revise or regenerate the request", "Hide the mismatch"], answer: "Flag it as not relevant and revise or regenerate the request", explanation: "A useful output must address the intended task." },
      { id: "privacy", prompt: "An output includes identifiable personal details not needed for the task. What is safest?", options: ["Share it widely", "Remove or escalate the sensitive details before use", "Copy it into a public document"], answer: "Remove or escalate the sensitive details before use", explanation: "Unnecessary identifiable details create privacy risk." }
    ]
  },
  {
    id: "statistics-sampling-quality",
    title: "Sampling and data-quality exercise",
    type: "scenario",
    category: "Statistics",
    competencyCode: "STAT_SAMPLING",
    competency: "Sampling",
    difficulty: "Beginner",
    minutes: 12,
    description: "Make defensible sampling and data-quality decisions in a small ARAMBH learning scenario.",
    learningObjectives: ["Match a sampling approach to a population", "Identify coverage problems", "Document a data-quality decision"],
    scenario: "A small survey team is planning a learning exercise and discovers uneven population coverage and missing responses.",
    task: "Choose the statistical action that best protects coverage and interpretability at each checkpoint.",
    expectedOutcome: "The learner identifies a defensible sampling approach and records data-quality limitations.",
    hints: ["Consider representation of important groups and document limitations instead of hiding them."],
    validationCriteria: ["All sampling and quality criteria selected correctly"],
    instructions: ["Review each survey planning situation.", "Choose the most defensible statistical action.", "Submit all sampling checkpoints."],
    checkpoints: [
      { id: "coverage", prompt: "Some districts are missing from the sampling frame. What should happen first?", options: ["Ignore the missing districts", "Investigate and improve frame coverage before sampling", "Replace them with convenient districts silently"], answer: "Investigate and improve frame coverage before sampling", explanation: "A sampling frame should cover the target population as well as practical." },
      { id: "groups", prompt: "A small but important subgroup must be represented. Which design may help?", options: ["Use a documented stratified approach", "Exclude the subgroup", "Select only the easiest respondents"], answer: "Use a documented stratified approach", explanation: "Stratification can support representation when planned and documented." },
      { id: "missing", prompt: "Several responses are missing a key field. What is the sound response?", options: ["Record and assess the missingness before treatment", "Replace all values with zero without review", "Delete the quality notes"], answer: "Record and assess the missingness before treatment", explanation: "Missingness should be assessed and its treatment documented." }
    ]
  },
  {
    id: "python-survey-cleaning",
    title: "Clean a survey dataset",
    type: "code",
    category: "Data Science",
    competencyCode: "TECH_PYTHON",
    competency: "Python",
    difficulty: "Beginner",
    minutes: 15,
    description: "Write a small pandas-style transformation that removes incomplete rows and aggregates responses by region.",
    learningObjectives: ["Profile and clean tabular data", "Aggregate a grouped statistic", "Explain a reproducible transformation"],
    scenario: "A survey extract contains incomplete responses and must be prepared for a regional summary.",
    task: "Complete the constrained pandas-style data transformation and print the expected regional result.",
    expectedOutcome: "A cleaned and reproducible regional aggregate is produced.",
    hints: ["Remove incomplete rows before grouping.", "Keep the transformation in the supplied DataFrame flow."],
    validationCriteria: ["DataFrame construction", "Missing-row removal", "Region grouping and sum", "Printed result"],
    instructions: ["Load the supplied rows into a DataFrame.", "Remove rows with missing values before grouping.", "Aggregate value by region and print the resulting dictionary."],
    starterCode: "import pandas as pd\n\nrows = {\"region\": [\"North\", \"South\", \"North\", \"South\"], \"value\": [10, 20, 30, None]}\ndf = pd.DataFrame(rows)\n# write your cleaning and aggregation steps here\n",
    checks: ["import pandas as pd", "dropna", "groupby", "print", "region"],
    expectedOutput: "{'North': 40, 'South': 20}"
  },
  {
    id: "cloud-data-pipeline",
    title: "Choose a resilient cloud pipeline",
    type: "scenario",
    category: "Cloud Computing",
    competencyCode: "TECH_CLOUD",
    competency: "Cloud Computing",
    difficulty: "Beginner",
    minutes: 10,
    description: "Make practical architecture decisions for a small official-statistics data pipeline.",
    learningObjectives: ["Choose durable storage", "Select an appropriate batch execution model", "Apply secret-management principles"],
    scenario: "You are planning a simulated cloud architecture for an intermittent official-statistics pipeline.",
    task: "Choose the safest answer at each architecture checkpoint.",
    expectedOutcome: "A defensible simulated cloud design is selected without connecting to a real provider.",
    hints: ["Prefer least privilege and durable managed services."],
    validationCriteria: ["All architecture checkpoints answered correctly"],
    instructions: ["Read each situation.", "Choose the safest and most operationally suitable answer.", "Submit after all checkpoints are answered."],
    checkpoints: [
      { id: "storage", prompt: "Where should raw survey files be retained for durable, access-controlled storage?", options: ["Ephemeral process memory", "Object storage with access policies", "A browser local variable"], answer: "Object storage with access policies", explanation: "Durable object storage plus least-privilege policies is appropriate for raw files." },
      { id: "scale", prompt: "A monthly processing job is idle most of the time. Which approach avoids keeping a server running continuously?", options: ["An on-demand managed job", "A laptop left switched on", "A public unauthenticated endpoint"], answer: "An on-demand managed job", explanation: "On-demand execution fits intermittent batch workloads and reduces operational overhead." },
      { id: "secrets", prompt: "Where should service credentials be kept?", options: ["Committed in source code", "A managed secret store", "Inside a public README"], answer: "A managed secret store", explanation: "Credentials should be kept out of source and handled through secret management." }
    ]
  },
  {
    id: "cyber-phishing-response",
    title: "Respond to a suspicious email",
    type: "scenario",
    category: "Cybersecurity",
    competencyCode: "DG_CYBER",
    competency: "Cybersecurity",
    difficulty: "Beginner",
    minutes: 10,
    description: "Practice the first decisions an official-statistics employee should make when a message requests sensitive action.",
    learningObjectives: ["Identify phishing indicators", "Use trusted verification channels", "Protect sensitive data"],
    scenario: "A suspicious message requests a sign-in and asks for sensitive data to be shared.",
    task: "Choose the safe defensive response at each checkpoint.",
    expectedOutcome: "The suspicious request is contained, reported, and handled through approved channels.",
    hints: ["Do not open unfamiliar links or share sensitive data through personal channels."],
    validationCriteria: ["All defensive checkpoints answered correctly"],
    instructions: ["Treat every message as a decision point.", "Choose the action that protects data and preserves an evidence trail.", "Submit all three checkpoints for review."],
    checkpoints: [
      { id: "link", prompt: "A message asks you to sign in through an unfamiliar link. What is the first action?", options: ["Open it quickly", "Do not open it; verify through a trusted channel", "Forward it to everyone"], answer: "Do not open it; verify through a trusted channel", explanation: "Avoiding the link and independently verifying the request reduces phishing risk." },
      { id: "report", prompt: "What should you do with a suspected phishing message?", options: ["Report it through the organization’s security process", "Delete it without telling anyone", "Reply with your password"], answer: "Report it through the organization’s security process", explanation: "Reporting helps the security team protect other users and preserve indicators." },
      { id: "data", prompt: "A colleague asks you to send a citizen dataset over personal email. What is the safe response?", options: ["Send it immediately", "Use the approved secure sharing process or refuse", "Post it in a public chat"], answer: "Use the approved secure sharing process or refuse", explanation: "Sensitive data must use approved channels and access controls." }
    ]
  },
  {
    id: "data-science-quality-check",
    title: "Prepare a reliable analysis dataset",
    type: "scenario",
    category: "Data Science",
    competencyCode: "TECH_DS",
    competency: "Data Science",
    difficulty: "Intermediate",
    minutes: 15,
    description: "Make careful data-science decisions before summarising a small official-statistics dataset.",
    learningObjectives: ["Profile missingness", "Investigate duplicate identifiers", "Document reproducible transformations"],
    scenario: "A small official-statistics extract needs quality checks before analysis.",
    task: "Choose the defensible data-quality action for each checkpoint.",
    expectedOutcome: "The analysis dataset is prepared with documented, reproducible decisions.",
    hints: ["Inspect data quality before applying a treatment."],
    validationCriteria: ["All data-quality checkpoints answered correctly"],
    instructions: ["Review each data-quality decision.", "Choose the action that keeps the analysis reproducible and defensible.", "Submit after all checkpoints are answered."],
    checkpoints: [
      { id: "missing", prompt: "A numeric survey field contains a small number of missing values. What should happen first?", options: ["Replace every missing value with zero without checking", "Profile the missingness and document an appropriate treatment", "Delete the entire dataset"], answer: "Profile the missingness and document an appropriate treatment", explanation: "Missingness should be measured and its treatment documented before analysis." },
      { id: "duplicate", prompt: "The same respondent identifier appears twice. What is the soundest next step?", options: ["Keep both rows silently", "Inspect the duplicate records against the data dictionary and source", "Rename one identifier at random"], answer: "Inspect the duplicate records against the data dictionary and source", explanation: "Duplicate records need investigation against definitions and source data before correction." },
      { id: "reproducible", prompt: "How should a cleaning step be made auditable?", options: ["Apply undocumented manual edits", "Use a repeatable transformation and retain a record of the change", "Only share the final chart"], answer: "Use a repeatable transformation and retain a record of the change", explanation: "Repeatable transformations and documented changes support reproducibility and review." }
    ]
  },
  {
    id: "automation-repeatable-workflow",
    title: "Design a repeatable reporting workflow",
    type: "scenario",
    category: "Automation",
    competencyCode: "TECH_AUTO",
    competency: "Automation",
    difficulty: "Intermediate",
    minutes: 15,
    description: "Choose dependable scripting and workflow practices for a recurring statistical report.",
    learningObjectives: ["Validate workflow inputs", "Handle failures observably", "Separate configuration from code"],
    scenario: "A recurring statistical report must run safely across multiple offices and input files.",
    task: "Choose the dependable automation practice for each workflow checkpoint.",
    expectedOutcome: "A repeatable, observable workflow design is selected.",
    hints: ["Validate inputs and make failures visible."],
    validationCriteria: ["All automation checkpoints answered correctly"],
    instructions: ["Work through each workflow decision.", "Prefer safe, observable, repeatable automation over shortcuts.", "Submit all checkpoints for review."],
    checkpoints: [
      { id: "input", prompt: "A monthly script receives input files from several offices. What should it do before processing?", options: ["Process the first file found", "Validate file names, schema, and required fields", "Skip validation to finish faster"], answer: "Validate file names, schema, and required fields", explanation: "Input validation prevents silent errors from entering a recurring workflow." },
      { id: "failure", prompt: "A transformation fails halfway through a run. What is the most useful behaviour?", options: ["Hide the error and publish partial output", "Stop safely, record the error, and make the run status visible", "Retry forever without a limit"], answer: "Stop safely, record the error, and make the run status visible", explanation: "Safe failure and observable status make automated workflows reviewable and recoverable." },
      { id: "schedule", prompt: "How should a recurring report be made easier to maintain?", options: ["Keep credentials and paths hardcoded in the script", "Separate configuration from code and log each run", "Change the script manually every month"], answer: "Separate configuration from code and log each run", explanation: "External configuration and run logs reduce maintenance risk and improve traceability." }
    ]
  }
];

export function validateVirtualLabDefinition(lab: Partial<Lab>) {
  validateVirtualLabCategory(lab.category);
  if (!lab.id || !lab.title || !lab.description || !lab.competencyCode || !lab.instructions) {
    throw new Error("Virtual lab definition is missing required fields.");
  }
  if (lab.type === "scenario") {
    for (const checkpoint of lab.checkpoints || []) {
      if (!checkpoint.id || !checkpoint.prompt || !checkpoint.options?.length || !checkpoint.answer || !checkpoint.explanation) {
        throw new Error("Scenario checkpoints require prompt, options, answer, and explanation.");
      }
      if (!checkpoint.options.includes(checkpoint.answer)) throw new Error(`Checkpoint answer is not one of its options: ${checkpoint.id}`);
    }
  }
  return lab;
}

for (const lab of VIRTUAL_LABS) validateVirtualLabDefinition(lab);

export function getLab(labId: string) {
  return VIRTUAL_LABS.find((lab) => lab.id === labId);
}

export function publicLab(lab: Lab) {
  return {
    ...lab,
    checkpoints: lab.checkpoints?.map(({ id, prompt, options }) => ({ id, prompt, options }))
  };
}

export function sanitizeSubmittedWorkMetadata(lab: Lab, submission: any) {
  if (lab.type === "code") {
    const code = typeof submission?.code === "string" ? submission.code : "";
    return { kind: "code", characterCount: code.length, lineCount: code ? code.split(/\r?\n/).length : 0 };
  }
  const answers = submission?.answers && typeof submission.answers === "object" ? submission.answers : {};
  return { kind: "checkpoint_answers", answeredCheckpointIds: Object.keys(answers).sort(), answerCount: Object.keys(answers).length };
}

function attemptDurationSec(startedAt: Date) {
  return Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));
}

export async function createLabAttempt(userId: string, labId: string) {
  const latest = await VirtualLabAttemptModel.findOne({ userId, labId }).sort({ attemptNumber: -1 }).lean();
  const counterUpdate = {
    $setOnInsert: { userId, labId },
    $inc: { nextAttemptNumber: 1 }
  };
  let counter;
  try {
    counter = await VirtualLabAttemptCounterModel.findOneAndUpdate(
      { userId, labId },
      counterUpdate,
      { upsert: true, new: true }
    ).lean();
  } catch (error: any) {
    // A concurrent upsert may race only while the counter is first created.
    // Retry without upsert so the existing atomic counter allocates the next number.
    if (error?.code !== 11000) throw error;
    counter = await VirtualLabAttemptCounterModel.findOneAndUpdate(
      { userId, labId },
      { $inc: { nextAttemptNumber: 1 } },
      { new: true }
    ).lean();
  }
  if (!counter) throw new Error("Could not allocate lab attempt number.");
  return VirtualLabAttemptModel.create({ userId, labId, attemptNumber: counter.nextAttemptNumber, status: "started" });
}

const PYTHON_AST_VALIDATOR = String.raw`
import ast, json, sys
code = sys.stdin.read()
try:
    tree = ast.parse(code)
except SyntaxError as exc:
    print(json.dumps({"passed": False, "reason": "Python syntax error: " + str(exc)}))
    raise SystemExit

assignments = {}
calls = []
printed_names = set()
for node in ast.walk(tree):
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name): assignments[target.id] = node.value
    if isinstance(node, ast.Call): calls.append(node)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "print":
        for arg in node.args:
            if isinstance(arg, ast.Name): printed_names.add(arg.id)

def attr_call(node, attr):
    return isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == attr

def name_call(node, name):
    return isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == name

has_pandas_import = any(isinstance(n, ast.Import) and any(a.name == "pandas" and (a.asname or "pd") == "pd" for a in n.names) for n in ast.walk(tree))
df_value = assignments.get("df")
has_dataframe = any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "DataFrame" for n in ast.walk(tree))
drop_value = assignments.get("df")
has_dropna = any(attr_call(n, "dropna") and isinstance(n.func.value, ast.Name) and n.func.value.id == "df" for n in calls)
group_value = assignments.get("result")
has_groupby = False
has_sum = False
has_region = False
has_output_dict = False
for node in ast.walk(tree):
    if attr_call(node, "groupby"):
        has_groupby = isinstance(node.func.value, ast.Name) and node.func.value.id == "df"
        has_region = bool(node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == "region")
    if attr_call(node, "sum"): has_sum = True
    if attr_call(node, "to_dict"): has_output_dict = True

computed_result = isinstance(group_value, ast.Call) and has_groupby and has_sum and has_output_dict
passed = has_pandas_import and has_dataframe and has_dropna and computed_result and "result" in printed_names and has_region
missing = []
if not has_pandas_import: missing.append("pandas import")
if not has_dataframe: missing.append("DataFrame construction")
if not has_dropna: missing.append("df.dropna() call")
if not has_groupby or not has_region: missing.append("df.groupby('region') call")
if not has_sum: missing.append("computed sum()")
if not has_output_dict: missing.append("to_dict() result")
if "result" not in printed_names: missing.append("print(result)")
print(json.dumps({"passed": passed, "reason": "AST/data-flow checks passed" if passed else "Missing genuine computation steps: " + ", ".join(missing)}))
`;

export function validatePythonLabCode(code: string): Promise<{ passed: boolean; reason: string }> {
  return new Promise((resolve) => {
    const command = process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");
    const args = process.env.PYTHON_BIN ? ["-c", PYTHON_AST_VALIDATOR] : process.platform === "win32" ? ["-3", "-c", PYTHON_AST_VALIDATOR] : ["-c", PYTHON_AST_VALIDATOR];
    let child;
    try {
      child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    } catch {
      resolve(validatePythonLabCodeFallback(code));
      return;
    }
    let output = "";
    const timer = setTimeout(() => { child.kill(); resolve({ passed: false, reason: "AST validator timed out." }); }, 3000);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); if (output.length > 4000) child.kill(); });
    child.on("error", () => { clearTimeout(timer); resolve(validatePythonLabCodeFallback(code)); });
    child.on("close", () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(output.trim())); } catch { resolve({ passed: false, reason: "AST validator returned no valid result." }); }
    });
    child.stdin.end(code);
  });
}

/** Conservative fallback used only when the AST helper process is unavailable. */
export function validatePythonLabCodeFallback(code: string): { passed: boolean; reason: string } {
  const source = code.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean).join("\n");
  const hasImport = /^import\s+pandas\s+as\s+pd(?:\n|$)/m.test(source);
  const hasDataFrame = /^df\s*=\s*pd\.DataFrame\s*\(/m.test(source);
  const hasDropna = /^df\s*=\s*df\.dropna\s*\(\s*\)\s*$/m.test(source);
  const hasGroupby = /^result\s*=\s*df\.groupby\s*\(\s*["']region["']\s*\)\s*\[\s*["']value["']\s*\]\s*\.sum\s*\(\s*\)\s*\.to_dict\s*\(\s*\)\s*$/m.test(source);
  const hasPrintResult = /^print\s*\(\s*result\s*\)\s*$/m.test(source);
  const passed = hasImport && hasDataFrame && hasDropna && hasGroupby && hasPrintResult;
  return { passed, reason: passed ? "Constrained data-flow validation passed." : "Missing genuine DataFrame → dropna → groupby → sum/to_dict → print(result) data flow." };
}

export async function listLabsForUser(userId: string) {
  const [completions, progress, attempts] = await Promise.all([
    VirtualLabCompletionModel.find({ userId }).lean(),
    LearningProgressModel.find({ userId, resourceType: "virtual_lab" }).lean(),
    VirtualLabAttemptModel.find({ userId }).sort({ startedAt: -1 }).lean()
  ]);
  const byLab = new Map(completions.map((completion) => [completion.labId, completion]));
  const progressByLab = new Map(progress.map((item) => [item.resourceId, item]));
  const attemptsByLab = new Map<string, any[]>();
  for (const attempt of attempts) attemptsByLab.set(attempt.labId, [...(attemptsByLab.get(attempt.labId) || []), attempt]);
  return VIRTUAL_LABS.map((lab) => ({
    ...publicLab(lab),
    completion: byLab.get(lab.id) || null,
    progress: progressByLab.get(lab.id) || null,
    attempts: attemptsByLab.get(lab.id) || []
  }));
}

export async function startLab(userId: string, labId: string) {
  const lab = getLab(labId);
  if (!lab) throw Object.assign(new Error("Lab not found"), { statusCode: 404 });
  const completion = await VirtualLabCompletionModel.findOne({ userId, labId }).lean();
  if (completion) return { lab: publicLab(lab), completion, alreadyCompleted: true };
  const attempt = await VirtualLabAttemptModel.findOne({ userId, labId, status: "started" }).sort({ startedAt: -1 }) || await createLabAttempt(userId, labId);
  const existingProgress = await LearningProgressModel.findOne({ userId, resourceType: "virtual_lab", resourceId: labId });
  const progress = await upsertLearningProgress({
    userId,
    resourceType: "virtual_lab",
    resourceId: labId,
    source: "arambh",
    progressPercent: Math.max(1, existingProgress?.progressPercent || 1),
    status: "in_progress",
    metadata: { labCategory: lab.category || "Statistics", attemptId: String(attempt._id), attemptStatus: "started" },
    emitActivity: true
  });
  return { lab: publicLab(lab), attempt, progress: progress.progress };
}

export async function submitLab(userId: string, labId: string, submission: any) {
  const lab = getLab(labId);
  if (!lab) throw Object.assign(new Error("Lab not found"), { statusCode: 404 });
  const existing = await VirtualLabCompletionModel.findOne({ userId, labId }).lean();
  if (existing) {
    const competency = await CompetencyModel.findOne({ code: lab.competencyCode, isActive: true }).select("_id").lean();
    if (!competency) return { lab, completion: existing, alreadyCompleted: true };
    const outcome = await recordLearningOutcome({
      userId,
      eventType: "lab.completed",
      resourceType: "lab",
      resourceId: lab.id,
      source: "arambh",
      sourceEventId: `${userId}:${lab.id}`,
      occurredAt: existing.completedAt,
      progressPercent: 100,
      outcomeScore: existing.score,
      competencyIds: [String(competency._id)],
      metadata: { competencyCode: lab.competencyCode, completionId: String(existing._id), labTitle: lab.title }
    });
    const processing = await processLearningOutcome(outcome.eventId);
    return { lab, completion: existing, alreadyCompleted: true, processing };
  }

  let attempt = await VirtualLabAttemptModel.findOne({ userId, labId, status: "started" }).sort({ startedAt: -1 });
  if (!attempt) attempt = await createLabAttempt(userId, labId);
  attempt.status = "submitted";
  attempt.submittedAt = new Date();
  attempt.durationSec = attemptDurationSec(attempt.startedAt);
  attempt.submittedWorkMetadata = sanitizeSubmittedWorkMetadata(lab, submission);
  await attempt.save();

  let passed = false;
  let feedback = "";
  if (lab.type === "code") {
    const code = String(submission?.code || "");
    const validation = await validatePythonLabCode(code);
    passed = validation.passed;
    feedback = passed ? "AST/data-flow validation passed: the result is computed through DataFrame cleaning, grouping, aggregation, and print(result)." : validation.reason;
  } else {
    const answers = submission?.answers || {};
    const wrong = (lab.checkpoints || []).filter((checkpoint) => answers[checkpoint.id] !== checkpoint.answer);
    passed = wrong.length === 0;
    feedback = passed ? "All scenario checkpoints are correct." : `${wrong.length} checkpoint(s) need another review: ${wrong.map((checkpoint) => checkpoint.id).join(", ")}.`;
  }
  if (!passed) {
    attempt.status = "failed";
    attempt.validationPassed = false;
    attempt.score = 0;
    attempt.feedback = feedback;
    attempt.failureReason = feedback;
    await attempt.save();
    const progress = await upsertLearningProgress({
      userId,
      resourceType: "virtual_lab",
      resourceId: labId,
      source: "arambh",
      progressPercent: 50,
      status: "in_progress",
      metadata: { attemptId: String(attempt._id), attemptStatus: "failed" },
      emitActivity: true
    });
    return { lab: publicLab(lab), passed: false, score: 0, feedback, attempt, progress: progress.progress };
  }

  const competency = await CompetencyModel.findOne({ code: lab.competencyCode, isActive: true }).select("_id").lean();
  if (!competency) throw Object.assign(new Error("Lab competency is not configured"), { statusCode: 503 });
  const score = 100;
  attempt.status = "passed";
  attempt.validationPassed = true;
  attempt.score = score;
  attempt.feedback = "Validated successfully.";
  attempt.completedAt = attempt.submittedAt;
  await attempt.save();
  let completion;
  try {
    completion = await VirtualLabCompletionModel.create({
      userId,
      labId,
      competencyCode: lab.competencyCode,
      score,
      submission: sanitizeSubmittedWorkMetadata(lab, submission),
      attemptId: attempt._id,
      feedback: "Validated successfully."
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    completion = await VirtualLabCompletionModel.findOne({ userId, labId });
  }
  if (!completion) throw Object.assign(new Error("Could not record lab completion."), { statusCode: 503 });
  const outcome = await recordLearningOutcome({
    userId,
    eventType: "lab.completed",
    resourceType: "lab",
    resourceId: lab.id,
    source: "arambh",
    sourceEventId: `${userId}:${lab.id}`,
    occurredAt: completion.completedAt,
    progressPercent: 100,
    outcomeScore: score,
    competencyIds: [String(competency._id)],
    metadata: { competencyCode: lab.competencyCode, completionId: String(completion._id), labTitle: lab.title }
  });
  const processing = await processLearningOutcome(outcome.eventId);
  await recordLearningActivity({
    userId,
    type: "lab",
    minutes: Math.round((attempt.durationSec || 0) / 60),
    meta: { labId, attemptId: String(attempt._id), status: "passed", outcomeEventId: outcome.eventId }
  });
  const progress = await upsertLearningProgress({
    userId,
    resourceType: "virtual_lab",
    resourceId: labId,
    source: "arambh",
    progressPercent: 100,
    status: "completed",
    metadata: { attemptId: String(attempt._id), attemptStatus: "passed" },
    emitActivity: false
  });
  attempt.outcomeEventId = outcome.eventId;
  await attempt.save();
  return { lab: publicLab(lab), passed: true, score, feedback, completion, attempt, progress: progress.progress, processing };
}
