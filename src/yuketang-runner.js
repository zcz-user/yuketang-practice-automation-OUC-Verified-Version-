const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { appendAISuggestion, inferAnswerWithAI } = require("./ai-inference");

const DEFAULT_URL = "";

const DATA_DIR = path.resolve("data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const BANK_PATH = path.join(DATA_DIR, "question-bank.json");
const QUESTIONS_JSONL = path.join(DATA_DIR, "questions.jsonl");
const ATTEMPTS_JSONL = path.join(DATA_DIR, "attempts.jsonl");
const BANK_CSV = path.join(DATA_DIR, "question-bank.csv");

const START_BUTTON_TEXTS = [
  "开始",
  "开始答题",
  "开始作答",
  "开始考试",
  "进入考试",
  "继续答题",
  "继续作答",
  "重新答题",
  "重新作答",
  "重新开始",
  "再做一次",
  "重新练习",
  "开始练习"
];

const NEXT_BUTTON_TEXTS = ["下一题", "下一页", "下一个", "下一步"];
const SUBMIT_BUTTON_TEXTS = ["提交", "交卷", "提交答案", "提交试卷"];
const CONFIRM_BUTTON_TEXTS = ["确定", "确认", "好的", "我知道了"];
const LOGIN_BUTTON_TEXTS = ["登录", "统一身份认证登录", "账号登录", "微信登录"];
const REVEAL_BUTTON_TEXTS = [
  "查看答案",
  "查看解析",
  "显示答案",
  "显示解析",
  "答案解析",
  "展开解析"
];
const REVIEW_BUTTON_TEXTS = [
  "\u67e5\u770b\u8bd5\u5377",
  "\u67e5\u770b\u7b54\u6848",
  "\u67e5\u770b\u89e3\u6790",
  "\u67e5\u770b\u7ed3\u679c"
];
const START_ACTION_TEXTS = [
  "\u518d\u6b21\u4f5c\u7b54",
  "\u91cd\u65b0\u4f5c\u7b54",
  "\u91cd\u65b0\u7b54\u9898",
  "\u518d\u505a\u4e00\u6b21",
  "\u5f00\u59cb\u7b54\u9898",
  "\u5f00\u59cb\u4f5c\u7b54",
  "\u5f00\u59cb\u8003\u8bd5",
  "\u7ee7\u7eed\u4f5c\u7b54",
  "\u7ee7\u7eed\u7b54\u9898",
  ...START_BUTTON_TEXTS
];

function parseArgs(argv) {
  const args = {
    url: process.env.YKT_URL || DEFAULT_URL,
    loop: false,
    stable: 3,
    maxAttempts: 50,
    autoFill: false,
    autoSubmit: false,
    unknownPolicy: "skip",
    aiMode: "off",
    aiModel: process.env.OPENAI_MODEL || "",
    aiMinConfidence: Number(process.env.YKT_AI_MIN_CONFIDENCE || 0.75),
    browserChannel: process.env.YKT_BROWSER_CHANNEL || "",
    headed: true,
    cookies: process.env.YKT_COOKIES_FILE || path.join("secrets", "yuketang-cookies.json"),
    waitMs: 1500,
    loginWaitSec: 180,
    slowMo: 0
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--url") {
      args.url = next;
      i += 1;
    } else if (token === "--loop") {
      args.loop = true;
    } else if (token === "--stable") {
      args.stable = Number(next);
      i += 1;
    } else if (token === "--max-attempts") {
      args.maxAttempts = Number(next);
      i += 1;
    } else if (token === "--auto-fill") {
      args.autoFill = true;
    } else if (token === "--auto-submit") {
      args.autoSubmit = true;
    } else if (token === "--unknown-policy") {
      args.unknownPolicy = String(next || "skip").toLowerCase();
      i += 1;
    } else if (token === "--ai-suggest") {
      args.aiMode = "suggest";
    } else if (token === "--ai-fill") {
      args.aiMode = "fill";
    } else if (token === "--ai-force-fill") {
      args.aiMode = "force";
    } else if (token === "--ai-model") {
      args.aiModel = String(next || "");
      i += 1;
    } else if (token === "--ai-min-confidence") {
      args.aiMinConfidence = Number(next);
      i += 1;
    } else if (token === "--browser-channel") {
      args.browserChannel = String(next || "");
      i += 1;
    } else if (token === "--headed") {
      args.headed = String(next).toLowerCase() !== "false";
      i += 1;
    } else if (token === "--cookies") {
      args.cookies = next;
      i += 1;
    } else if (token === "--wait-ms") {
      args.waitMs = Number(next);
      i += 1;
    } else if (token === "--login-wait-sec" || token === "--login-wait") {
      args.loginWaitSec = Number(next);
      i += 1;
    } else if (token === "--slow-mo") {
      args.slowMo = Number(next);
      i += 1;
    } else if (token === "--help" || token === "-h") {
      printHelpAndExit();
    }
  }

  if (!["skip", "first", "random"].includes(args.unknownPolicy)) {
    throw new Error("--unknown-policy must be skip, first, or random");
  }
  if (!Number.isFinite(args.stable) || args.stable < 1) {
    throw new Error("--stable must be a positive number");
  }
  if (!Number.isFinite(args.maxAttempts) || args.maxAttempts < 1) {
    throw new Error("--max-attempts must be a positive number");
  }
  if (!["off", "suggest", "fill", "force"].includes(args.aiMode)) {
    throw new Error("AI mode must be off, suggest, fill, or force.");
  }
  if (!Number.isFinite(args.aiMinConfidence) || args.aiMinConfidence < 0 || args.aiMinConfidence > 1) {
    throw new Error("--ai-min-confidence must be between 0 and 1");
  }
  if (!args.url) {
    throw new Error("Pass the Rain Classroom quiz URL with --url or set YKT_URL.");
  }
  return args;
}

function printHelpAndExit() {
  console.log(`
Usage:
  npm run ykt -- --url "https://example.com/path/to/practice/quiz" --loop --stable 3 --auto-fill --auto-submit --unknown-policy random

Options:
  --url <url>                  Rain Classroom quiz URL.
  --loop                       Repeat attempts until stable or max-attempts.
  --stable <n>                 Stop after n consecutive attempts with no new questions.
  --max-attempts <n>           Safety cap. Default: 50.
  --auto-fill                  Fill answers from the local bank.
  --auto-submit                Submit automatically.
  --unknown-policy <mode>      skip, first, or random. Default: skip.
  --ai-suggest                 Ask AI for unknown-question suggestions and record them only.
  --ai-fill                    Fill unknown questions only when AI confidence passes --ai-min-confidence.
  --ai-force-fill              Fill unknown questions with AI suggestions even when confidence is low.
  --ai-model <model>           OpenAI model for AI suggestions. Defaults to OPENAI_MODEL or gpt-5-mini.
  --ai-min-confidence <0-1>    Minimum confidence for --ai-fill. Default: 0.75.
  --browser-channel <name>     Browser channel for Playwright, e.g. msedge or chrome.
  --headed false               Run browser headless.
  --cookies <file>             Optional cookie JSON file.
  --login-wait-sec <n>         Seconds to keep a visible browser open for manual login. Default: 180.
`);
  process.exit(0);
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

function loadBank() {
  if (!fs.existsSync(BANK_PATH)) {
    return { version: 1, updatedAt: new Date().toISOString(), questions: {} };
  }
  return JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
}

function saveBank(bank) {
  bank.updatedAt = new Date().toISOString();
  fs.writeFileSync(BANK_PATH, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
  exportBankCsv(bank);
}

function appendJsonl(file, row) {
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, "utf8");
}

function normalizeText(value) {
  return stripHtml(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n+\s*/g, "\n")
    .trim();
}

function normalizeForKey(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[，。；：,.!?！？、]/g, "")
    .toLowerCase();
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashText(value, length = 16) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function optionLabel(index) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function questionFingerprint(question) {
  const stem = normalizeForKey(question.stem);
  const options = (question.options || []).map((option) => normalizeForKey(option.text));
  return hashText([stem, ...options].join("|"), 20);
}

function parseQuizRoute(urlValue) {
  const meta = {};
  const match = String(urlValue).match(/\/lms\/([^/]+)\/(\d+)\/exam\/(\d+)/);
  if (match) {
    meta.sign = match[1];
    meta.classroomId = Number(match[2]);
    meta.leafId = Number(match[3]);
  }
  try {
    meta.origin = new URL(urlValue).origin;
  } catch {
    meta.origin = "https://www.yuketang.cn";
  }
  return meta;
}

function mergeExamMeta(payload, meta) {
  const seenObjects = new WeakSet();

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (seenObjects.has(node)) return;
    seenObjects.add(node);

    if (node.content_info && typeof node.content_info === "object" && node.content_info.leaf_type_id) {
      meta.examId = Number(node.content_info.leaf_type_id);
    }
    if (node.user_id && !meta.userId) meta.userId = Number(node.user_id);
    if (node.classroom_id && !meta.classroomId) meta.classroomId = Number(node.classroom_id);
    if (node.result && typeof node.result === "object" && node.result.status !== undefined) {
      meta.status = Number(node.result.status);
    }
    if (node.problem_count && !meta.problemCount) meta.problemCount = Number(node.problem_count);

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    Object.values(node).forEach(walk);
  }

  walk(payload);
  return meta;
}

async function tryDirectExamTrans(page, args, examMeta) {
  if (!examMeta.examId || !examMeta.userId || !examMeta.classroomId) {
    console.log(`Direct exam route unavailable: ${JSON.stringify({
      hasExamId: Boolean(examMeta.examId),
      hasUserId: Boolean(examMeta.userId),
      hasClassroomId: Boolean(examMeta.classroomId)
    })}`);
    return false;
  }

  const target = new URL(`/pro/exam_trans/${examMeta.examId}/${examMeta.userId}/${examMeta.classroomId}`, examMeta.origin || args.url);
  target.searchParams.set("status", String(Number.isFinite(examMeta.status) ? examMeta.status : 0));
  target.searchParams.set("isFrom", "1");
  console.log("Trying direct exam route fallback...");
  await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  return confirmExamStart(page);
}

async function confirmExamStart(page) {
  const start = Date.now();
  while (Date.now() - start < 45_000) {
    const text = await extractPageText(page);
    if (isQuestionScreenText(text)) return true;
    const confirmed = await clickTrustedText(page, ["开始", "确认开始", "进入考试", "开始答题"]);
    if (confirmed.clicked) {
      console.log(`Confirmed exam start: ${JSON.stringify(confirmed)}`);
      await page.waitForTimeout(1500);
      const ready = await waitForQuestionScreen(page, 60_000);
      if (ready) return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

async function clickTrustedText(page, texts) {
  for (const text of texts) {
    const locator = page.getByText(text, { exact: true });
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      const visible = await item.isVisible().catch(() => false);
      if (!visible) continue;
      await item.click({ timeout: 5000, force: true }).catch(async () => {
        const box = await item.boundingBox().catch(() => null);
        if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      });
      return { clicked: true, text };
    }
  }
  return { clicked: false };
}

function cleanQuestion(question, source = "unknown") {
  const options = (question.options || [])
    .map((option, index) => ({
      label: normalizeText(option.label || optionLabel(index)).slice(0, 8),
      text: normalizeText(option.text)
    }))
    .filter((option) => option.text.length > 0);

  const cleaned = {
    stem: normalizeText(question.stem),
    type: normalizeText(question.type || guessQuestionType(question.stem, options)),
    options,
    correctLabels: [],
    correctTexts: [],
    explanation: normalizeText(question.explanation || ""),
    source,
    rawAnswer: question.rawAnswer
  };

  const canonical = canonicalAnswers(question.correctAnswers || question.answer || question.rawAnswer, options);
  cleaned.correctLabels = canonical.labels;
  cleaned.correctTexts = canonical.texts;

  return cleaned;
}

function guessQuestionType(stem, options) {
  const text = normalizeText(stem);
  if (options.length === 2 && options.some((o) => /正确|对|是|√/.test(o.text))) return "判断题";
  if (/多选|多项/.test(text)) return "多选题";
  if (/判断/.test(text)) return "判断题";
  return "单选题";
}

function canonicalAnswers(raw, options) {
  const labels = new Set();
  const texts = new Set();
  const values = flattenAnswer(raw);

  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;

    const compact = text.replace(/\s+/g, "").replace(/[、，,;；|/]/g, "");
    if (/^[A-H]+$/i.test(compact)) {
      for (const char of compact.toUpperCase()) labels.add(char);
      continue;
    }

    if (/^(true|false)$/i.test(compact)) {
      const wantsTrue = /^true$/i.test(compact);
      const matchedOption = options.find((option) => {
        const optionText = normalizeForKey(option.text);
        return wantsTrue
          ? /\u6b63\u786e|\u5bf9|\u662f|true/.test(optionText)
          : /\u9519\u8bef|\u9519|\u5426|false/.test(optionText);
      });
      if (matchedOption) {
        labels.add(matchedOption.label.toUpperCase());
        texts.add(matchedOption.text);
        continue;
      }
      labels.add(wantsTrue ? "A" : "B");
      continue;
    }

    if (/^\d+$/.test(compact)) {
      const index = Number(compact) - 1;
      if (index >= 0 && index < options.length) labels.add(optionLabel(index));
      continue;
    }

    const match = text.match(/(?:正确答案|参考答案|答案)\s*[:：]?\s*([A-H](?:\s*[,，、;；]?\s*[A-H])*)/i);
    if (match) {
      for (const char of match[1].replace(/[^A-H]/gi, "").toUpperCase()) labels.add(char);
      continue;
    }

    const normalized = normalizeForKey(text);
    const matchedOption = options.find((option) => {
      const optionText = normalizeForKey(option.text);
      return optionText === normalized || optionText.includes(normalized) || normalized.includes(optionText);
    });
    if (matchedOption) {
      labels.add(matchedOption.label.toUpperCase());
      texts.add(matchedOption.text);
    } else {
      texts.add(text);
    }
  }

  return {
    labels: [...labels].sort(),
    texts: [...texts].sort()
  };
}

function flattenAnswer(raw) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.flatMap(flattenAnswer);
  if (typeof raw === "object") {
    const keys = [
      "label",
      "key",
      "value",
      "content",
      "text",
      "answer",
      "correct_answer",
      "right_answer",
      "option"
    ];
    return keys.flatMap((key) => flattenAnswer(raw[key])).filter(Boolean);
  }
  return [raw];
}

function mergeQuestion(bank, question, attemptId, pageUrl) {
  const fingerprint = questionFingerprint(question);
  const now = new Date().toISOString();
  const existing = bank.questions[fingerprint];

  if (!existing) {
    bank.questions[fingerprint] = {
      fingerprint,
      stem: question.stem,
      type: question.type,
      options: question.options,
      correctLabels: question.correctLabels || [],
      correctTexts: question.correctTexts || [],
      explanation: question.explanation || "",
      firstSeenAt: now,
      lastSeenAt: now,
      seenCount: 1,
      attempts: [attemptId],
      pageUrl,
      sources: [question.source]
    };
    return { fingerprint, isNew: true };
  }

  existing.lastSeenAt = now;
  existing.seenCount = (existing.seenCount || 0) + 1;
  if (!existing.attempts.includes(attemptId)) existing.attempts.push(attemptId);
  if (question.source && !existing.sources.includes(question.source)) existing.sources.push(question.source);
  existing.type = existing.type || question.type;
  existing.options = mergeOptions(existing.options || [], question.options || []);
  existing.correctLabels = mergeArray(existing.correctLabels || [], question.correctLabels || []);
  existing.correctTexts = mergeArray(existing.correctTexts || [], question.correctTexts || []);
  if (!existing.explanation && question.explanation) existing.explanation = question.explanation;
  return { fingerprint, isNew: false };
}

function mergeOptions(existing, incoming) {
  const byLabel = new Map(existing.map((option) => [String(option.label).toUpperCase(), option]));
  for (const option of incoming) {
    const label = String(option.label).toUpperCase();
    if (!byLabel.has(label)) byLabel.set(label, option);
    if (byLabel.has(label) && !byLabel.get(label).text && option.text) byLabel.get(label).text = option.text;
  }
  return [...byLabel.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

function mergeArray(left, right) {
  return [...new Set([...(left || []), ...(right || [])].filter(Boolean))].sort();
}

function exportBankCsv(bank) {
  const rows = [
    ["fingerprint", "type", "stem", "options", "answer", "explanation", "seenCount", "firstSeenAt", "lastSeenAt"]
  ];
  for (const question of Object.values(bank.questions)) {
    rows.push([
      question.fingerprint,
      question.type || "",
      question.stem || "",
      (question.options || []).map((o) => `${o.label}. ${o.text}`).join("\n"),
      [
        ...(question.correctLabels || []),
        ...(question.correctTexts || []).filter((text) => !(question.correctLabels || []).includes(text))
      ].join(", "),
      question.explanation || "",
      String(question.seenCount || 0),
      question.firstSeenAt || "",
      question.lastSeenAt || ""
    ]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  fs.writeFileSync(BANK_CSV, `\ufeff${csv}\n`, "utf8");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function candidateStringField(object, patterns) {
  for (const [key, value] of Object.entries(object)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    if (patterns.some((pattern) => pattern.test(key))) {
      const text = normalizeText(value);
      if (text) return text;
    }
  }
  return "";
}

function candidateArrayField(object, patterns) {
  for (const [key, value] of Object.entries(object)) {
    if (!Array.isArray(value)) continue;
    if (patterns.some((pattern) => pattern.test(key))) return value;
  }
  return null;
}

function extractQuestionsFromPayload(payload, sourceLabel) {
  const found = [];
  const seenObjects = new WeakSet();

  function walk(node, trail) {
    if (!node || typeof node !== "object") return;
    if (seenObjects.has(node)) return;
    seenObjects.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${trail}[${index}]`));
      return;
    }

    const candidate = buildPayloadQuestionCandidate(node, `${sourceLabel}:${trail}`);
    if (candidate) found.push(candidate);

    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === "object") walk(value, `${trail}.${key}`);
    }
  }

  walk(payload, "$");
  return dedupeQuestions(found);
}

function buildPayloadQuestionCandidate(object, source) {
  const stem = candidateStringField(object, [
    /^(stem|title|question|name|body|content|html)$/i,
    /question.*content/i,
    /problem.*content/i,
    /item.*content/i,
    /topic/i
  ]);
  if (!stem || normalizeForKey(stem).length < 8) return null;

  const optionArray = candidateArrayField(object, [
    /option/i,
    /choice/i,
    /answer.*list/i,
    /answers/i,
    /items/i,
    /children/i
  ]);
  const options = parseOptions(optionArray);
  if (options.length < 2 || options.length > 12) return null;

  const answer = collectAnswerFromObject(object);
  const explanation = candidateStringField(object, [/analysis/i, /explain/i, /solution/i, /解析/, /说明/]);
  const type = candidateStringField(object, [/type/i, /category/i, /题型/]);

  return cleanQuestion(
    {
      stem,
      type,
      options,
      rawAnswer: answer,
      correctAnswers: answer,
      explanation
    },
    source
  );
}

function parseOptions(optionArray) {
  if (!Array.isArray(optionArray)) return [];
  const options = [];

  optionArray.forEach((item, index) => {
    if (item === null || item === undefined) return;
    if (typeof item === "string" || typeof item === "number") {
      options.push({ label: optionLabel(index), text: normalizeText(item) });
      return;
    }
    if (typeof item !== "object") return;

    const label =
      normalizeText(item.label || item.key || item.option || item.prefix || item.no || item.index || optionLabel(index)) ||
      optionLabel(index);
    const text =
      candidateStringField(item, [
        /^(content|text|title|name|value|html|body)$/i,
        /option.*content/i,
        /answer.*content/i,
        /choice.*content/i
      ]) || normalizeText(item.content || item.text || item.title || "");

    if (text) options.push({ label: /^[A-H]$/i.test(label) ? label.toUpperCase() : optionLabel(index), text });
  });

  return options;
}

function collectAnswerFromObject(object) {
  const answerKeys = Object.keys(object).filter((key) =>
    /correct|right|standard|reference|solution|true|答案|answer/i.test(key)
  );
  const values = [];
  for (const key of answerKeys) {
    if (/student|stu|user|my|mine|submit/i.test(key)) continue;
    const value = object[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || Array.isArray(value) || typeof value === "object") {
      values.push(value);
    }
  }
  return values;
}

function dedupeQuestions(questions) {
  const byFingerprint = new Map();
  for (const question of questions) {
    if (!question.stem || question.options.length < 2) continue;
    const fingerprint = questionFingerprint(question);
    const existing = byFingerprint.get(fingerprint);
    if (!existing) {
      byFingerprint.set(fingerprint, question);
      continue;
    }
    existing.correctLabels = mergeArray(existing.correctLabels, question.correctLabels);
    existing.correctTexts = mergeArray(existing.correctTexts, question.correctTexts);
    if (!existing.explanation && question.explanation) existing.explanation = question.explanation;
    if (question.source && !existing.source.includes(question.source)) {
      existing.source = `${existing.source}; ${question.source}`;
    }
  }
  return [...byFingerprint.values()];
}

function parseTextQuestions(text, source = "dom") {
  const rawLines = normalizeText(text).split("\n").map((line) => normalizeText(line)).filter(Boolean);
  const lines = rawLines.filter((line) => !isNoiseLine(line));
  if (!lines.length) return [];

  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isQuestionStart(lines[i])) starts.push(i);
  }

  const chunks = [];
  if (starts.length > 0) {
    for (let i = 0; i < starts.length; i += 1) {
      const start = starts[i];
      const end = starts[i + 1] || lines.length;
      chunks.push(lines.slice(start, end));
    }
  } else {
    chunks.push(lines);
  }

  const questions = chunks.map((chunk) => parseQuestionChunk(chunk, source)).filter(Boolean);
  return dedupeQuestions(questions);
}

function isNoiseLine(line) {
  return /^(上一题|下一题|提交|交卷|答题卡|题目列表|返回|保存|确定|取消|加载中|暂无数据)$/.test(line);
}

function isQuestionStart(line) {
  if (/^[A-H][.．、\s]/i.test(line)) return false;
  if (/^\d+\s*[.．、]\s*\S+/.test(line)) return true;
  if (/^第\s*\d+\s*题/.test(line)) return true;
  if (/^\d+\s*\/\s*\d+/.test(line) && /题|单选|多选|判断/.test(line)) return true;
  if (/^(单选题|多选题|判断题|填空题)\s*\d*/.test(line)) return true;
  return false;
}

function parseQuestionChunk(chunk, source) {
  const stemLines = [];
  const options = [];
  const answerParts = [];
  const explanationLines = [];
  let type = "";
  let inExplanation = false;

  for (const line of chunk) {
    const optionMatch = line.match(/^([A-H])\s*[.．、:：\)]\s*(.+)$/i);
    const answerMatch = line.match(/(?:正确答案|参考答案|答案)\s*[:：]?\s*([A-H](?:\s*[,，、;；]?\s*[A-H])*)/i);

    if (/单选题|多选题|判断题|填空题/.test(line) && !type) {
      type = (line.match(/单选题|多选题|判断题|填空题/) || [""])[0];
    }

    if (answerMatch) {
      answerParts.push(answerMatch[1]);
      continue;
    }
    if (/^(解析|答案解析|解题思路)[:：]?/.test(line)) {
      inExplanation = true;
      explanationLines.push(line.replace(/^(解析|答案解析|解题思路)[:：]?/, "").trim());
      continue;
    }
    if (optionMatch) {
      options.push({ label: optionMatch[1].toUpperCase(), text: optionMatch[2] });
      continue;
    }
    if (inExplanation) {
      explanationLines.push(line);
      continue;
    }
    stemLines.push(line.replace(/^\d+\s*[.．、]\s*/, "").replace(/^第\s*\d+\s*题\s*/, ""));
  }

  if (options.length < 2) return null;
  const stem = stemLines.join("\n");
  if (normalizeForKey(stem).length < 8) return null;

  return cleanQuestion(
    {
      stem,
      type,
      options,
      rawAnswer: answerParts,
      correctAnswers: answerParts,
      explanation: explanationLines.join("\n")
    },
    source
  );
}

async function loadCookies(context, cookieFile) {
  if (!cookieFile || !fs.existsSync(cookieFile)) return false;
  const raw = JSON.parse(fs.readFileSync(cookieFile, "utf8"));
  const cookies = raw.map((cookie) => {
    const mapped = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure)
    };
    if (cookie.expirationDate) mapped.expires = Math.floor(cookie.expirationDate);
    if (cookie.expires) mapped.expires = Math.floor(cookie.expires);
    const sameSite = String(cookie.sameSite || "").toLowerCase();
    if (sameSite === "no_restriction" || sameSite === "none") mapped.sameSite = "None";
    if (sameSite === "lax") mapped.sameSite = "Lax";
    if (sameSite === "strict") mapped.sameSite = "Strict";
    return mapped;
  });
  await context.addCookies(cookies);
  console.log(`Loaded ${cookies.length} cookies from ${cookieFile}`);
  return true;
}

async function collectPageSnapshot(page, attemptDir, stepLabel) {
  fs.mkdirSync(attemptDir, { recursive: true });
  const safeLabel = stepLabel.replace(/[^a-z0-9_-]+/gi, "_");
  const textPath = path.join(attemptDir, `${safeLabel}.txt`);
  const htmlPath = path.join(attemptDir, `${safeLabel}.html`);
  const screenshotPath = path.join(attemptDir, `${safeLabel}.png`);

  const text = await extractPageText(page);
  const html = await page.content().catch(() => "");
  fs.writeFileSync(textPath, text, "utf8");
  fs.writeFileSync(htmlPath, html, "utf8");
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);
  return { text, html, textPath, htmlPath, screenshotPath };
}

async function extractPageText(page) {
  const text = await page
    .evaluate(() => {
      const output = [];
      const blocked = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);
      const seen = new Set();

      const isVisibleElement = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      };

      const push = (value) => {
        const text = String(value || "").replace(/\s+/g, " ").trim();
        if (text) output.push(text);
      };

      const walk = (node) => {
        if (!node || seen.has(node)) return;
        seen.add(node);

        if (node.nodeType === Node.TEXT_NODE) {
          push(node.nodeValue);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;

        if (node.nodeType === Node.ELEMENT_NODE) {
          if (blocked.has(node.tagName) || !isVisibleElement(node)) return;
          if (node.getAttribute("aria-label")) push(node.getAttribute("aria-label"));
          if (node.getAttribute("title")) push(node.getAttribute("title"));
          if (node.value && ["INPUT", "TEXTAREA"].includes(node.tagName)) push(node.value);
        }

        if (node.shadowRoot) walk(node.shadowRoot);
        for (const child of node.childNodes || []) walk(child);
      };

      walk(document.documentElement);
      return output.join("\n");
    })
    .catch(() => "");

  if (normalizeText(text)) return normalizeText(text);
  return page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
}

async function waitForInteractivePage(page, args) {
  const start = Date.now();
  const timeoutMs = Math.max(0, args.loginWaitSec) * 1000;
  let lastText = "";
  let announcedLogin = false;
  let clickedLogin = false;

  while (Date.now() - start < timeoutMs) {
    const text = await extractPageText(page);
    lastText = text;
    const compact = normalizeForKey(text);
    const isLoadingOnly = /正在加载|loading/i.test(text) && compact.length < 40;
    const hasQuizSignals = /开始|作答|答题|提交|交卷|单选|多选|判断|第\s*\d+\s*题|下一题/.test(text);
    const hasLoginSignals = /登录|扫码|验证码|账号|密码/.test(text);
    const hasMojibakeLoginSignals = /鐧诲綍|韬唤|璁よ瘉|璐﹀彿|瀵嗙爜/.test(text);
    const isPortalHome =
      /\/pro\/portal\/home/i.test(page.url()) ||
      /数据模块|学生总数|教师总数|课程总数|鏁版嵁妯″潡|瀛︾敓鎬绘暟|鏁欏笀鎬绘暟/.test(text);
    const needsLogin = hasLoginSignals || hasMojibakeLoginSignals || isPortalHome;

    if (hasQuizSignals && !isLoadingOnly) return { ready: true, text };
    if (needsLogin && args.headed && !clickedLogin) {
      const loginClick = await clickFirstByText(page, LOGIN_BUTTON_TEXTS, { allowIncludes: true, waitMs: 1500 });
      clickedLogin = loginClick.clicked;
    }
    if (needsLogin && args.headed && !announcedLogin) {
      console.log("Login/portal page detected. Complete login in the opened browser; the script will continue automatically.");
      announcedLogin = true;
    }
    if (!needsLogin && !isLoadingOnly && compact.length > 40) return { ready: true, text };
    await page.waitForTimeout(1500);
  }

  return { ready: false, text: lastText };
}

async function clickFirstByText(page, texts, options = {}) {
  const result = await page.evaluate((payload) => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const isDisabled = (el) =>
      el.disabled ||
      el.getAttribute("aria-disabled") === "true" ||
      /\bdisabled\b/.test(el.className || "");
    const clickables = [
      ...document.querySelectorAll(
        "button, a, [role='button'], .ant-btn, .van-button, .el-button, .btn-quiz, .linkkk, [class*='btn'], [class*='button'], [class*='pointer']"
      )
    ];
    const candidates = clickables.filter((el) => visible(el) && !isDisabled(el));
    for (const wanted of payload.texts) {
      const exact = candidates.find((el) => (el.innerText || el.textContent || "").trim() === wanted);
      if (exact) {
        exact.click();
        return { clicked: true, text: wanted };
      }
    }
    if (payload.allowIncludes) {
      for (const wanted of payload.texts) {
        const partial = candidates.find((el) => (el.innerText || el.textContent || "").trim().includes(wanted));
        if (partial) {
          partial.click();
          return { clicked: true, text: wanted };
        }
      }
    }
    return { clicked: false };
  }, { texts, allowIncludes: Boolean(options.allowIncludes) });

  if (result.clicked && options.waitMs !== 0) {
    await page.waitForTimeout(options.waitMs || 1000);
  }
  return result;
}

async function maybeStartQuiz(page) {
  for (let i = 0; i < 5; i += 1) {
    const text = await extractPageText(page);
    if (isQuestionScreenText(text)) return true;
    const clicked = await clickStartButton(page);
    console.log(`Start click attempt ${i + 1}: ${JSON.stringify(clicked)}`);
    if (!clicked.clicked) return false;
    const started = await waitForQuestionScreen(page, 6_000);
    if (started) return true;
    const afterClickText = await extractPageText(page);
    if (isQuestionLoadingText(afterClickText)) return true;
  }
  return false;
}

async function clickStartButton(page) {
  await page.waitForSelector(".btn-quiz, .quiz .btn__group, .linkkk", {
    state: "visible",
    timeout: 20_000
  }).catch(() => null);

  const byText = await clickFirstByText(page, START_ACTION_TEXTS, { allowIncludes: true, waitMs: 2500 });
  if (byText.clicked) return byText;

  const byLocator = await clickVisibleLocator(page, [".linkkk", ".btn-quiz", ".quiz .btn__group"]);
  if (byLocator.clicked) {
    await page.waitForTimeout(2500);
    return byLocator;
  }

  const byClass = await page
    .evaluate(() => {
      const visible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const candidates = [...document.querySelectorAll(".btn-quiz, .quiz .btn__group, .linkkk")].filter(visible);
      const target =
        candidates.find((el) => /开始|寮€濮/.test(el.innerText || el.textContent || "")) ||
        candidates.find((el) => (el.innerText || el.textContent || "").trim());
      if (!target) return { clicked: false };
      target.scrollIntoView({ block: "center", inline: "center" });
      target.click();
      return { clicked: true, text: (target.innerText || target.textContent || "").trim() };
    })
    .catch(() => ({ clicked: false }));

  if (byClass.clicked) await page.waitForTimeout(2500);
  return byClass;
}

async function clickVisibleLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      const visible = await item.isVisible().catch(() => false);
      if (!visible) continue;
      const text = await item.innerText({ timeout: 1000 }).catch(() => "");
      const normalizedText = normalizeText(text);
      if (REVIEW_BUTTON_TEXTS.some((reviewText) => normalizedText === reviewText || normalizedText.includes(reviewText))) {
        continue;
      }
      const box = await item.boundingBox().catch(() => null);
      if (!box) continue;
      try {
        await item.click({ timeout: 5000, force: true });
      } catch {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      return { clicked: true, selector, text: normalizedText };
    }
  }
  return { clicked: false };
}

function isQuestionLoadingText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return (
    /正在加载|加载中|loading/i.test(normalized) ||
    /\/0题\b/.test(normalized) ||
    /暂无题目|题目加载中/.test(normalized)
  );
}

function isQuestionScreenText(text) {
  const normalized = normalizeText(text);
  if (!normalized || isQuestionLoadingText(normalized)) return false;
  if (/单选题|多选题|判断题|填空题|第\s*\d+\s*题/.test(normalized)) return true;
  if (/^[\s\S]*\b[A-H]\s*[.．、:：\)]\s*\S+[\s\S]*\b[B-H]\s*[.．、:：\)]\s*\S+/.test(normalized)) {
    return !/试卷分数|题数|考生须知|开始答题|正在加载|加载中/.test(normalized);
  }
  return false;
}

async function waitForQuestionScreen(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(1000);
    const text = await extractPageText(page);
    if (isQuestionScreenText(text)) return true;
  }
  return false;
}

async function maybeRevealAnswers(page) {
  let clickedAny = false;
  for (let i = 0; i < 5; i += 1) {
    const clicked = await clickFirstByText(page, REVEAL_BUTTON_TEXTS, { allowIncludes: true, waitMs: 800 });
    if (!clicked.clicked) break;
    clickedAny = true;
  }
  return clickedAny;
}

async function openReviewAfterSubmit(page, args) {
  const waitMs = Math.max(12_000, args.waitMs * 5);
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const url = page.url();
    if (/\/result\/|\/cover\//.test(url)) break;
    await page.waitForTimeout(1000);
  }

  if (/\/result\//.test(page.url())) return { opened: true, alreadyOpen: true };

  for (let i = 0; i < 3; i += 1) {
    const trusted = await clickTrustedText(page, REVIEW_BUTTON_TEXTS);
    if (trusted.clicked) {
      await page.waitForURL(/\/result\//, { timeout: 10_000 }).catch(() => null);
      await page.waitForTimeout(3000);
      return { opened: /\/result\//.test(page.url()), clicked: trusted.text };
    }
    const clicked = await clickFirstByText(page, REVIEW_BUTTON_TEXTS, { allowIncludes: true, waitMs: 1500 });
    if (clicked.clicked) {
      await page.waitForURL(/\/result\//, { timeout: 10_000 }).catch(() => null);
      await page.waitForTimeout(3000);
      return { opened: /\/result\//.test(page.url()), clicked: clicked.text };
    }
    await page.waitForTimeout(1000);
  }
  return { opened: false, reason: "review button not found" };
}

async function clickDialogButton(page, texts) {
  const target = await page.evaluate((payload) => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const dialogs = [
      ...document.querySelectorAll(".el-message-box, .el-dialog, [role='dialog'], .ant-modal, .modal, .dialog")
    ].filter(visible);
    for (const dialog of dialogs) {
      const candidates = [...dialog.querySelectorAll("button, [role='button'], .el-button, .ant-btn, .btn")].filter(
        visible
      );
      for (const wanted of payload.texts) {
        const match = candidates.find((el) => {
          const text = (el.innerText || el.textContent || "").trim();
          return text === wanted || text.includes(wanted);
        });
        if (!match) continue;
        const rect = match.getBoundingClientRect();
        return {
          found: true,
          text: (match.innerText || match.textContent || "").trim(),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
    }
    return { found: false };
  }, { texts });

  if (!target.found) return { clicked: false };
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(1500);
  return { clicked: true, text: target.text };
}

async function submitAttempt(page) {
  await waitForAnswerSaves(page, 5000);
  const clicked = await clickFirstByText(page, SUBMIT_BUTTON_TEXTS, { allowIncludes: true, waitMs: 1000 });
  if (!clicked.clicked) return { submitted: false, reason: "submit button not found" };

  for (let i = 0; i < 6; i += 1) {
    const dialogClicked = await clickDialogButton(page, [...SUBMIT_BUTTON_TEXTS, ...CONFIRM_BUTTON_TEXTS]);
    if (dialogClicked.clicked) continue;

    const trusted = await clickTrustedText(page, [...SUBMIT_BUTTON_TEXTS, ...CONFIRM_BUTTON_TEXTS]);
    if (trusted.clicked) {
      await page.waitForTimeout(1500);
      continue;
    }
    const confirmed = await clickFirstByText(page, [...SUBMIT_BUTTON_TEXTS, ...CONFIRM_BUTTON_TEXTS], {
      allowIncludes: true,
      waitMs: 1000
    });
    if (!confirmed.clicked) break;
  }
  await page.waitForTimeout(2000);
  const text = await extractPageText(page).catch(() => "");
  if (/\u672a\u5b8c\u6210|\u7ee7\u7eed\u4f5c\u7b54/.test(text) && /\u4ea4\u5377|\u63d0\u4ea4/.test(text)) {
    return { submitted: false, reason: "submit confirmation still visible" };
  }
  return { submitted: true };
}

async function clickNextQuestion(page) {
  const clicked = await clickFirstByText(page, NEXT_BUTTON_TEXTS, { allowIncludes: true, waitMs: 1000 });
  return clicked.clicked;
}

function answersForQuestion(bankEntry, visibleQuestion, unknownPolicy) {
  if (bankEntry) {
    const labels = bankEntry.correctLabels || [];
    const texts = bankEntry.correctTexts || [];
    if (labels.length || texts.length) {
      return resolveAnswerOptions(visibleQuestion, { labels, texts });
    }
  }

  if (unknownPolicy === "first" && visibleQuestion.options.length) {
    return [visibleQuestion.options[0]];
  }
  if (unknownPolicy === "random" && visibleQuestion.options.length) {
    const count = isMultipleChoiceQuestion(visibleQuestion) ? Math.min(2, visibleQuestion.options.length) : 1;
    return shuffle([...visibleQuestion.options]).slice(0, count);
  }
  return [];
}

async function suggestAnswersForQuestion(question, fingerprint, attemptId, args) {
  try {
    const suggestion = await inferAnswerWithAI(question, { model: args.aiModel || undefined });
    const answers = resolveAnswerOptions(question, { labels: suggestion.labels, texts: [] });
    const event = {
      at: new Date().toISOString(),
      attemptId,
      fingerprint,
      mode: args.aiMode,
      question: {
        stem: question.stem,
        type: question.type,
        options: question.options
      },
      suggestion,
      answers: answers.map((answer) => `${answer.label}. ${answer.text}`)
    };
    appendAISuggestion(event);
    return { suggestion, answers, error: "" };
  } catch (error) {
    const event = {
      at: new Date().toISOString(),
      attemptId,
      fingerprint,
      mode: args.aiMode,
      error: String(error.message || error),
      question: {
        stem: question.stem,
        type: question.type,
        options: question.options
      }
    };
    appendAISuggestion(event);
    return { suggestion: null, answers: [], error: event.error };
  }
}

function isMultipleChoiceQuestion(question) {
  const typeText = `${question.type || ""} ${question.Type || ""} ${question.TypeText || ""} ${question.stem || ""}`;
  return /multi|multiple/i.test(typeText) || /\u591a\u9009|\u591a\u9879/.test(typeText);
}

function resolveAnswerOptions(question, answerSpec) {
  const labels = new Set((answerSpec.labels || []).map((label) => String(label).toUpperCase()));
  const textKeys = (answerSpec.texts || []).map(normalizeForKey).filter(Boolean);
  return (question.options || []).filter((option) => {
    if (labels.has(String(option.label).toUpperCase())) return true;
    const optionKey = normalizeForKey(option.text);
    return textKeys.some((key) => optionKey === key || optionKey.includes(key) || key.includes(optionKey));
  });
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

async function fillQuestionAnswers(page, question, answers) {
  const clicked = [];
  for (const answer of answers) {
    const target = await page.evaluate((payload) => {
      const clean = (text) => String(text || "").replace(/\s+/g, "").trim();
      const visible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const area = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width * rect.height;
      };
      const stemSnippet = clean(payload.stem).slice(0, 32);
      const answerText = clean(payload.answerText);
      const label = clean(payload.answerLabel).toUpperCase();
      const optionNeedle = answerText || label;
      if (!optionNeedle) return { found: false, reason: "empty answer" };

      const clickTargetFor = (el) =>
        el.closest("label, button, [role='radio'], [role='checkbox'], .el-radio, .el-checkbox") || el;

      const isSelected = (el) => {
        const target = clickTargetFor(el);
        const input = el.matches && el.matches("input") ? el : target.querySelector("input");
        const classText = `${target.className || ""} ${input ? input.className || "" : ""}`;
        return Boolean(
          (input && input.checked) ||
            target.getAttribute("aria-checked") === "true" ||
            /\bis-checked\b/.test(classText) ||
            target.querySelector(".is-checked")
        );
      };

      const clickPointFor = (el) => {
        const target = clickTargetFor(el);
        if (!visible(target)) return null;
        target.scrollIntoView({ block: "center", inline: "center" });
        const marker =
          [...target.querySelectorAll(".el-checkbox__input, .el-radio__input, .ant-checkbox, .ant-radio")].find(
            visible
          ) || target;
        const rect = marker.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const usableRect = rect.width > 0 && rect.height > 0 ? rect : targetRect;
        return {
          found: true,
          alreadySelected: isSelected(el),
          x: usableRect.left + usableRect.width / 2,
          y: usableRect.top + usableRect.height / 2,
          targetText: (target.innerText || target.textContent || "").trim().slice(0, 80)
        };
      };

      const primaryContainers = [
        ...document.querySelectorAll(".subject-item, .exercise-item, [class*='subject'], [class*='exercise']")
      ]
        .filter(visible)
        .filter((el) => {
          const text = clean(el.innerText || el.textContent || "");
          return stemSnippet && text.includes(stemSnippet);
        })
        .sort((a, b) => area(a) - area(b));

      const fallbackContainers = [...document.querySelectorAll("section, article, form, li, div")]
        .filter(visible)
        .filter((el) => {
          const text = clean(el.innerText || el.textContent || "");
          return stemSnippet && text.includes(stemSnippet);
        })
        .sort((a, b) => area(a) - area(b));

      const scopes = (primaryContainers.length ? primaryContainers : fallbackContainers).slice(0, 5);
      if (!scopes.length) return { found: false, reason: "question container not found" };

      for (const scope of scopes) {
        const inputCandidates = [];
        if (label) inputCandidates.push(label);
        if (label === "A" || /\u6b63\u786e|\u5c0d|\u5bf9|\u662f|true/i.test(answerText)) inputCandidates.push("true");
        if (label === "B" || /\u9519\u8bef|\u932f|\u9519|\u5426|false/i.test(answerText)) inputCandidates.push("false");

        for (const value of inputCandidates) {
          const input = [...scope.querySelectorAll("input")].find(
            (el) => clean(el.value).toUpperCase() === clean(value).toUpperCase()
          );
          if (input) {
            const point = clickPointFor(input);
            if (point) return point;
          }
        }

        const elements = [
          ...scope.querySelectorAll(
            "label, button, [role='radio'], [role='checkbox'], .ant-radio-wrapper, .ant-checkbox-wrapper, .el-radio, .el-checkbox, .van-radio, .van-checkbox, span, div, li"
          )
        ]
          .filter(visible)
          .filter((el) => {
            const text = clean(el.innerText || el.textContent || "");
            return text.includes(answerText) || (label && text === label) || (label && text.startsWith(label));
          })
          .sort((a, b) => area(a) - area(b));

        for (const element of elements) {
          const point = clickPointFor(element);
          if (point) return point;
        }
      }
      return { found: false, reason: "option not found" };
    }, {
      stem: question.stem,
      answerText: answer.text,
      answerLabel: answer.label
    });

    if (!target.found) {
      clicked.push({ answer, result: { clicked: false, reason: target.reason || "option not found" } });
      continue;
    }
    if (target.alreadySelected) {
      clicked.push({ answer, result: { clicked: false, alreadySelected: true, targetText: target.targetText } });
      continue;
    }

    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(800);
    const selectedAfter = await isAnswerSelected(page, question, answer);
    clicked.push({ answer, result: { clicked: true, targetText: target.targetText, selectedAfter } });
  }
  await waitForAnswerSaves(page, 3000);
  return clicked;
}

async function isAnswerSelected(page, question, answer) {
  return page.evaluate((payload) => {
    const clean = (text) => String(text || "").replace(/\s+/g, "").trim();
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const area = (el) => {
      const rect = el.getBoundingClientRect();
      return rect.width * rect.height;
    };
    const selected = (el) => {
      const wrapper = el.closest("label, [role='radio'], [role='checkbox'], .el-radio, .el-checkbox") || el;
      const input = el.matches && el.matches("input") ? el : wrapper.querySelector("input");
      const classText = `${wrapper.className || ""} ${input ? input.className || "" : ""}`;
      return Boolean(
        (input && input.checked) ||
          wrapper.getAttribute("aria-checked") === "true" ||
          /\bis-checked\b/.test(classText) ||
          wrapper.querySelector(".is-checked")
      );
    };
    const stemSnippet = clean(payload.stem).slice(0, 32);
    const answerText = clean(payload.answerText);
    const label = clean(payload.answerLabel).toUpperCase();
    const scopes = [
      ...document.querySelectorAll(".subject-item, .exercise-item, [class*='subject'], [class*='exercise']")
    ]
      .filter(visible)
      .filter((el) => stemSnippet && clean(el.innerText || el.textContent || "").includes(stemSnippet))
      .sort((a, b) => area(a) - area(b));

    for (const scope of scopes.slice(0, 5)) {
      const inputCandidates = [];
      if (label) inputCandidates.push(label);
      if (label === "A" || /\u6b63\u786e|\u5c0d|\u5bf9|\u662f|true/i.test(answerText)) inputCandidates.push("true");
      if (label === "B" || /\u9519\u8bef|\u932f|\u9519|\u5426|false/i.test(answerText)) inputCandidates.push("false");

      for (const value of inputCandidates) {
        const input = [...scope.querySelectorAll("input")].find(
          (el) => clean(el.value).toUpperCase() === clean(value).toUpperCase()
        );
        if (input) return selected(input);
      }
      const match = [...scope.querySelectorAll("label, [role='radio'], [role='checkbox'], .el-radio, .el-checkbox")]
        .filter(visible)
        .find((el) => {
          const text = clean(el.innerText || el.textContent || "");
          return text.includes(answerText) || (label && text === label) || (label && text.startsWith(label));
        });
      if (match) return selected(match);
    }
    return false;
  }, {
    stem: question.stem,
    answerText: answer.text,
    answerLabel: answer.label
  });
}

async function waitForAnswerSaves(page, timeoutMs = 4000) {
  const started = Date.now();
  let quietChecks = 0;
  while (Date.now() - started < timeoutMs) {
    const busy = await page.evaluate(() => {
      const visible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      return [...document.querySelectorAll(".el-icon-loading, [class*='loading']")].some(visible);
    }).catch(() => false);
    if (!busy) {
      quietChecks += 1;
      if (quietChecks >= 3) return true;
    } else {
      quietChecks = 0;
    }
    await page.waitForTimeout(350);
  }
  return false;
}

async function captureVisibleQuestions(page, networkQuestions, attemptDir, stepLabel) {
  const snapshot = await collectPageSnapshot(page, attemptDir, stepLabel);
  const domQuestions = parseTextQuestions(snapshot.text, `${stepLabel}:dom`);
  const questions = dedupeQuestions([...domQuestions, ...networkQuestions]);
  return { questions, snapshot };
}

function makeAttemptId(index) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `attempt-${String(index).padStart(3, "0")}-${stamp}`;
}

async function runAttempt(context, args, bank, attemptIndex) {
  const page = await context.newPage();
  const attemptId = makeAttemptId(attemptIndex);
  const attemptDir = path.join(RAW_DIR, attemptId);
  fs.mkdirSync(attemptDir, { recursive: true });

  const networkQuestions = [];
  const examMeta = parseQuizRoute(args.url);
  let rawResponseIndex = 0;
  const networkLogPath = path.join(attemptDir, "network-log.jsonl");
  page.on("request", (request) => {
    const requestUrl = request.url();
    if (!/yuketang|exam|quiz|paper|problem|question/i.test(requestUrl)) return;
    appendJsonl(networkLogPath, {
      kind: "request",
      at: new Date().toISOString(),
      method: request.method(),
      url: requestUrl,
      postData: request.postData()
    });
  });
  page.on("response", async (response) => {
    try {
      const requestUrl = response.url();
      const contentType = response.headers()["content-type"] || "";
      if (/yuketang|exam|quiz|paper|problem|question/i.test(requestUrl)) {
        appendJsonl(networkLogPath, {
          kind: "response",
          at: new Date().toISOString(),
          status: response.status(),
          url: requestUrl,
          contentType
        });
      }
      if (!contentType.includes("json")) return;
      if (!/yuketang|exam|quiz|paper|problem|question/i.test(requestUrl)) return;
      const payload = await response.json();
      const rawText = JSON.stringify(payload, null, 2);
      if (rawText.length < 5_000_000) {
        rawResponseIndex += 1;
        const rawPath = path.join(attemptDir, `response-${String(rawResponseIndex).padStart(3, "0")}.json`);
        fs.writeFileSync(rawPath, `${rawText}\n`, "utf8");
      }
      mergeExamMeta(payload, examMeta);
      const extracted = extractQuestionsFromPayload(payload, `network:${hashText(requestUrl, 10)}`);
      networkQuestions.push(...extracted);
    } catch {
      // Some JSON-ish responses are intentionally not readable by Playwright after redirects.
    }
  });

  console.log(`\n[${attemptId}] Opening quiz URL...`);
  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(args.waitMs);

  const readiness = await waitForInteractivePage(page, args);
  if (!readiness.ready) {
    console.log(
      `[${attemptId}] Page did not become interactive within ${args.loginWaitSec}s; capturing whatever is visible.`
    );
  }

  const startedByCover = await maybeStartQuiz(page);
  if (!startedByCover) {
    await tryDirectExamTrans(page, args, examMeta);
  }
  await page.waitForTimeout(args.waitMs);
  await waitForQuestionScreen(page, 90_000).catch(() => null);

  const collectedByFingerprint = new Map();
  const fillEvents = [];
  const visitedScreens = new Set();

  let loadingWaits = 0;
  for (let step = 1; step <= 40;) {
    const stepLabel = `screen-${String(step).padStart(2, "0")}`;
    const { questions, snapshot } = await captureVisibleQuestions(page, networkQuestions, attemptDir, stepLabel);
    if (!questions.length && isQuestionLoadingText(snapshot.text)) {
      loadingWaits += 1;
      if (loadingWaits >= 60) {
        console.log(`[${attemptId}] Question area kept loading for too long; stopping capture loop.`);
        break;
      }
      await page.waitForTimeout(Math.max(args.waitMs, 1500));
      continue;
    }
    loadingWaits = 0;
    const screenKey = hashText(snapshot.text, 20);
    if (visitedScreens.has(screenKey) && step > 1) break;
    visitedScreens.add(screenKey);

    for (const question of questions) {
      const fingerprint = questionFingerprint(question);
      if (!collectedByFingerprint.has(fingerprint)) collectedByFingerprint.set(fingerprint, question);
    }

    if (args.autoFill) {
      for (const question of questions) {
        const fingerprint = questionFingerprint(question);
        const bankEntry = bank.questions[fingerprint];
        const hasKnownAnswer = Boolean(
          bankEntry && ((bankEntry.correctLabels || []).length || (bankEntry.correctTexts || []).length)
        );
        let answers = answersForQuestion(bankEntry, question, args.unknownPolicy);
        let answerSource = hasKnownAnswer ? "bank" : args.unknownPolicy;
        let aiSuggestion = null;
        if (!answers.length && args.aiMode !== "off") {
          const aiResult = await suggestAnswersForQuestion(question, fingerprint, attemptId, args);
          aiSuggestion = aiResult.suggestion
            ? {
                labels: aiResult.suggestion.labels,
                confidence: aiResult.suggestion.confidence,
                needsReview: aiResult.suggestion.needsReview,
                reason: aiResult.suggestion.reason,
                model: aiResult.suggestion.model
              }
            : { error: aiResult.error };
          const canUseConfidentAI =
            args.aiMode === "fill" &&
            aiResult.suggestion &&
            !aiResult.suggestion.needsReview &&
            aiResult.suggestion.confidence >= args.aiMinConfidence;
          const canForceAI = args.aiMode === "force" && aiResult.suggestion && aiResult.answers.length;
          if (canUseConfidentAI || canForceAI) {
            answers = aiResult.answers;
            answerSource = canForceAI ? "ai-force" : "ai";
          }
        }
        if (!answers.length) {
          fillEvents.push({
            fingerprint,
            status: "skipped",
            reason: aiSuggestion ? "AI suggestion recorded for review" : "no known answer",
            aiSuggestion
          });
          continue;
        }
        const clicks = await fillQuestionAnswers(page, question, answers);
        fillEvents.push({
          fingerprint,
          status: clicks.every((click) => click.result.clicked) ? "filled" : "partial",
          answers: answers.map((answer) => `${answer.label}. ${answer.text}`),
          source: answerSource,
          aiSuggestion,
          clicks
        });
      }
    }

    const advanced = await clickNextQuestion(page);
    if (!advanced) break;
    step += 1;
  }

  let submitted = false;
  let submitReason = "";
  let reviewResult = null;
  if (args.autoSubmit) {
    console.log(`[${attemptId}] Submitting attempt...`);
    const result = await submitAttempt(page);
    submitted = result.submitted;
    submitReason = result.reason || "";
    await page.waitForTimeout(args.waitMs);
    if (submitted) {
      reviewResult = await openReviewAfterSubmit(page, args);
    }
    await maybeRevealAnswers(page);
    const after = await captureVisibleQuestions(page, networkQuestions, attemptDir, reviewResult?.opened ? "after-review" : "after-submit");
    for (const question of after.questions) {
      const fingerprint = questionFingerprint(question);
      const existing = collectedByFingerprint.get(fingerprint);
      if (existing) {
        existing.correctLabels = mergeArray(existing.correctLabels, question.correctLabels);
        existing.correctTexts = mergeArray(existing.correctTexts, question.correctTexts);
        if (!existing.explanation && question.explanation) existing.explanation = question.explanation;
      } else {
        collectedByFingerprint.set(fingerprint, question);
      }
    }
  }

  const questions = [...collectedByFingerprint.values()];
  const fingerprints = [];
  const newFingerprints = [];
  const knownBefore = new Set(Object.keys(bank.questions));

  for (const question of questions) {
    const { fingerprint, isNew } = mergeQuestion(bank, question, attemptId, page.url());
    fingerprints.push(fingerprint);
    if (isNew || !knownBefore.has(fingerprint)) newFingerprints.push(fingerprint);
    appendJsonl(QUESTIONS_JSONL, {
      attemptId,
      fingerprint,
      capturedAt: new Date().toISOString(),
      question
    });
  }
  saveBank(bank);

  const allRepeated = questions.length > 0 && newFingerprints.length === 0;
  const attemptSummary = {
    attemptId,
    attemptIndex,
    capturedAt: new Date().toISOString(),
    url: args.url,
    finalUrl: page.url(),
    questionCount: questions.length,
    newQuestionCount: newFingerprints.length,
    allRepeated,
    submitted,
    submitReason,
    reviewResult,
    fingerprints,
    newFingerprints,
    fillEvents
  };
  appendJsonl(ATTEMPTS_JSONL, attemptSummary);
  await page.close();
  console.log(
    `[${attemptId}] questions=${questions.length}, new=${newFingerprints.length}, repeated=${allRepeated}, submitted=${submitted}`
  );
  return attemptSummary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDirs();
  const bank = loadBank();

  console.log("Rain Classroom practice automation");
  console.log(`URL: ${args.url}`);
  console.log(`Mode: loop=${args.loop}, stable=${args.stable}, maxAttempts=${args.maxAttempts}`);
  console.log(`Fill: autoFill=${args.autoFill}, autoSubmit=${args.autoSubmit}, unknown=${args.unknownPolicy}`);
  console.log(`AI: mode=${args.aiMode}, model=${args.aiModel || process.env.OPENAI_MODEL || "gpt-5-mini"}, minConfidence=${args.aiMinConfidence}`);
  console.log(`Browser: channel=${args.browserChannel || "bundled chromium"}`);

  const context = await chromium.launchPersistentContext(path.resolve(".playwright-profile"), {
    channel: args.browserChannel || undefined,
    headless: !args.headed,
    slowMo: args.slowMo,
    viewport: { width: 1365, height: 900 },
    locale: "zh-CN"
  });

  try {
    await loadCookies(context, args.cookies);
    let consecutiveRepeated = 0;
    const attemptsToRun = args.loop ? args.maxAttempts : 1;
    for (let index = 1; index <= attemptsToRun; index += 1) {
      const summary = await runAttempt(context, args, bank, index);
      consecutiveRepeated = summary.allRepeated ? consecutiveRepeated + 1 : 0;
      console.log(`Stable streak: ${consecutiveRepeated}/${args.stable}`);
      if (args.loop && consecutiveRepeated >= args.stable) {
        console.log(`Stop condition reached: ${args.stable} consecutive fully repeated attempts.`);
        break;
      }
      if (!args.loop) break;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
