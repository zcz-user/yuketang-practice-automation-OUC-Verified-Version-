const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { appendAISuggestion, inferAnswerWithAI } = require("./ai-inference");

const DEFAULT_EXAM_ID = process.env.YKT_EXAM_ID || "";

const DATA_DIR = path.resolve("data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const BANK_PATH = path.join(DATA_DIR, "question-bank.json");
const BANK_CSV = path.join(DATA_DIR, "question-bank.csv");
const FAST_JSONL = path.join(DATA_DIR, "fast-attempts.jsonl");

const TEXT_AGAIN = "\u518d\u6b21\u4f5c\u7b54";
const TEXT_STARTS = [
  "\u5f00\u59cb",
  "\u5f00\u59cb\u7b54\u9898",
  "\u5f00\u59cb\u4f5c\u7b54",
  "\u5f00\u59cb\u8003\u8bd5",
  "\u5f00\u59cb\u7ec3\u4e60"
];

function parseArgs(argv) {
  const args = {
    examId: DEFAULT_EXAM_ID,
    attempts: 20,
    stable: Number(process.env.YKT_STABLE || 3),
    timeBudgetSec: 600,
    aiMode: "off",
    aiModel: process.env.OPENAI_MODEL || "",
    aiMinConfidence: Number(process.env.YKT_AI_MIN_CONFIDENCE || 0.75),
    headless: true,
    waitMs: 500
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--exam-id") {
      args.examId = String(next || "");
      i += 1;
    } else if (token === "--attempts") {
      args.attempts = Number(next);
      i += 1;
    } else if (token === "--stable") {
      args.stable = Number(next);
      i += 1;
    } else if (token === "--time-budget-sec") {
      args.timeBudgetSec = Number(next);
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
    } else if (token === "--headed") {
      args.headless = String(next).toLowerCase() === "false" ? true : false;
      i += 1;
    } else if (token === "--headless") {
      args.headless = String(next).toLowerCase() !== "false";
      i += 1;
    } else if (token === "--wait-ms") {
      args.waitMs = Number(next);
      i += 1;
    }
  }
  if (!args.examId) {
    throw new Error("Pass --exam-id <id> or set YKT_EXAM_ID.");
  }
  if (!Number.isFinite(args.stable) || args.stable < 1) {
    throw new Error("--stable must be a positive number");
  }
  if (!["off", "suggest", "fill", "force"].includes(args.aiMode)) {
    throw new Error("AI mode must be off, suggest, fill, or force.");
  }
  if (!Number.isFinite(args.aiMinConfidence) || args.aiMinConfidence < 0 || args.aiMinConfidence > 1) {
    throw new Error("--ai-min-confidence must be between 0 and 1");
  }
  return args;
}

function examUrls(examId) {
  return {
    cover: `https://changjiang-exam.yuketang.cn/cover/${examId}?isFrom=1`,
    start: `https://changjiang-exam.yuketang.cn/start/${examId}?isFrom=1`,
    result: `https://changjiang-exam.yuketang.cn/result/${examId}?isFrom=1`
  };
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

function hashText(value, length = 20) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function optionLabel(index) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function questionFingerprint(question) {
  return hashText([normalizeForKey(question.stem), ...(question.options || []).map((o) => normalizeForKey(o.text))].join("|"));
}

function loadBank() {
  if (!fs.existsSync(BANK_PATH)) return { version: 1, updatedAt: new Date().toISOString(), questions: {} };
  return JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
}

function mergeArray(left, right) {
  return [...new Set([...(left || []), ...(right || [])].filter(Boolean))].sort();
}

function parseProblem(problem, source) {
  const stem = normalizeText(problem.Body || problem.body || problem.title || problem.content || "");
  const options = (problem.Options || problem.options || [])
    .map((option, index) => ({
      label: /^[A-H]$/i.test(String(option.key || "")) ? String(option.key).toUpperCase() : optionLabel(index),
      key: String(option.key ?? optionLabel(index)),
      text: normalizeText(option.value ?? option.text ?? option.content ?? "")
    }))
    .filter((option) => option.text);

  const question = {
    stem,
    type: problem.Type || problem.TypeText || String(problem.ProblemType || ""),
    options,
    correctLabels: [],
    correctTexts: [],
    explanation: "",
    source,
    problemId: problem.problem_id || problem.ProblemID || problem.id
  };

  const answers = Array.isArray(problem.Answer) ? problem.Answer : problem.Answer === undefined ? [] : [problem.Answer];
  for (const rawAnswer of answers) {
    const answer = String(rawAnswer);
    if (/^[A-H]$/i.test(answer)) {
      question.correctLabels.push(answer.toUpperCase());
      continue;
    }
    const optionIndex = options.findIndex((option) => String(option.key).toLowerCase() === answer.toLowerCase());
    if (optionIndex >= 0) {
      question.correctLabels.push(options[optionIndex].label);
      question.correctTexts.push(options[optionIndex].text);
    } else {
      question.correctTexts.push(normalizeText(answer));
    }
  }

  question.correctLabels = mergeArray([], question.correctLabels);
  question.correctTexts = mergeArray([], question.correctTexts);
  return question;
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
      options: question.options.map(({ label, text }) => ({ label, text })),
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
    return true;
  }

  existing.lastSeenAt = now;
  existing.seenCount = (existing.seenCount || 0) + 1;
  if (!existing.attempts.includes(attemptId)) existing.attempts.push(attemptId);
  if (question.source && !(existing.sources || []).includes(question.source)) {
    (existing.sources || (existing.sources = [])).push(question.source);
  }
  existing.correctLabels = mergeArray(existing.correctLabels, question.correctLabels);
  existing.correctTexts = mergeArray(existing.correctTexts, question.correctTexts);
  return false;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportBankCsv(bank) {
  const rows = [["fingerprint", "type", "stem", "options", "answer", "explanation", "seenCount", "firstSeenAt", "lastSeenAt"]];
  for (const question of Object.values(bank.questions)) {
    rows.push([
      question.fingerprint,
      question.type || "",
      question.stem || "",
      (question.options || []).map((option) => `${option.label}. ${option.text}`).join("\n"),
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
  fs.writeFileSync(BANK_CSV, `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
}

function isMultiple(problem) {
  const text = String(problem.Type || problem.TypeText || problem.ProblemType || "");
  return /multiple/i.test(text) || text.includes("\u591a\u9009") || text === "2";
}

function resultForLabels(problem, labels) {
  return [
    ...new Set(
      labels
        .map((label) => {
          const index = label.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
          return String((problem.Options || [])[index]?.key ?? label);
        })
        .filter(Boolean)
    )
  ];
}

function fallbackResultFor(problem) {
  const options = problem.Options || [];
  if (isMultiple(problem)) return options.map((option) => String(option.key));
  return [String(options[0]?.key ?? "A")];
}

function answerFor(problem, question, bank) {
  const entry = bank.questions[questionFingerprint(question)];
  let labels = entry?.correctLabels || [];
  if (!labels.length && (entry?.correctTexts || []).length) {
    const keys = (entry.correctTexts || []).map(normalizeForKey);
    labels = question.options
      .filter((option) => {
        const optionKey = normalizeForKey(option.text);
        return keys.some((key) => optionKey === key || optionKey.includes(key) || key.includes(optionKey));
      })
      .map((option) => option.label);
  }

  if (labels.length) {
    return { result: resultForLabels(problem, labels), source: "bank", labels };
  }

  return { result: fallbackResultFor(problem), source: "fallback", labels: [] };
}

async function answerForWithAI(problem, question, bank, args, attemptId) {
  const fingerprint = questionFingerprint(question);
  const known = answerFor(problem, question, bank);
  if (known.source === "bank" || args.aiMode === "off") return known;

  try {
    const suggestion = await inferAnswerWithAI(question, { model: args.aiModel || undefined });
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
      suggestion
    };
    appendAISuggestion(event);

    if (
      (args.aiMode === "fill" || args.aiMode === "force") &&
      suggestion.labels.length &&
      (args.aiMode === "force" || (!suggestion.needsReview && suggestion.confidence >= args.aiMinConfidence))
    ) {
      return {
        result: resultForLabels(problem, suggestion.labels),
        source: args.aiMode === "force" ? "ai-force" : "ai",
        labels: suggestion.labels,
        suggestion
      };
    }
    return { ...known, source: "fallback-after-ai-suggest", suggestion };
  } catch (error) {
    appendAISuggestion({
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
    });
    return { ...known, source: "fallback-after-ai-error", error: String(error.message || error) };
  }
}

async function clickExactText(page, text) {
  return page.evaluate((wanted) => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const clean = (value) => String(value || "").replace(/\s+/g, "").trim();
    const candidates = [
      ...document.querySelectorAll("button, a, [role='button'], .el-button, .btn, .linkkk, [class*='btn']")
    ].filter(visible);
    const target = candidates.find((element) => clean(element.innerText || element.textContent) === clean(wanted));
    if (!target) return { clicked: false };
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return { clicked: true, text: target.innerText || target.textContent || "" };
  }, text);
}

async function clickStartPrimary(page) {
  const clickedPrimary = await page
    .locator(".el-message-box__btns .el-button--primary, .el-dialog__footer .el-button--primary")
    .last()
    .click({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (clickedPrimary) return { clicked: true, method: "primary" };
  const exact = await clickExactText(page, TEXT_STARTS[0]);
  if (exact.clicked) return { clicked: true, method: "exact-start" };
  const startLike = await page.evaluate((texts) => {
    const wanted = texts.map((text) => String(text).replace(/\s+/g, ""));
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const clean = (value) => String(value || "").replace(/\s+/g, "");
    const candidates = [...document.querySelectorAll("button, a, [role='button'], .el-button, .btn, [class*='btn']")].filter(visible);
    const target = candidates.find((element) => {
      const text = clean(element.innerText || element.textContent || "");
      return wanted.some((needle) => text === needle || text.includes(needle) || needle.includes(text));
    });
    if (!target) return { clicked: false };
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return { clicked: true, text: target.innerText || target.textContent || "" };
  }, TEXT_STARTS);
  if (startLike.clicked) return { clicked: true, method: "text", text: startLike.text };
  return { clicked: false, method: "exact" };
}

async function beginAttempt(page, attemptId, dir, waitMs, urls) {
  await page.goto(urls.cover, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(waitMs);
  await fs.promises.writeFile(path.join(dir, "cover.txt"), await page.evaluate(() => document.body.innerText).catch(() => ""), "utf8");

  const again = await clickExactText(page, TEXT_AGAIN);
  if (!again.clicked) {
    await page.goto(urls.start, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } else {
    await page.waitForURL(/\/start\//, { timeout: 12_000 }).catch(() => null);
  }
  await page.waitForTimeout(waitMs);

  const start = await clickStartPrimary(page);
  await page.waitForURL(/\/exam\//, { timeout: 15_000 }).catch(() => null);
  await page.waitForTimeout(waitMs);

  const body = await page.evaluate(() => document.body.innerText).catch(() => "");
  await fs.promises.writeFile(path.join(dir, "started.txt"), body, "utf8");
  return { again, start, url: page.url(), isExam: /\/exam\//.test(page.url()) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urls = examUrls(args.examId);
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const bank = loadBank();
  const context = await chromium.launchPersistentContext(path.resolve(".playwright-profile"), {
    headless: args.headless,
    viewport: { width: 900, height: 700 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const deadline = Date.now() + args.timeBudgetSec * 1000;

  try {
    let stableStreak = 0;
    for (let index = 1; index <= args.attempts && Date.now() < deadline; index += 1) {
      const attemptId = `fast2-${String(index).padStart(3, "0")}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const dir = path.join(RAW_DIR, attemptId);
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[${attemptId}] begin`);

      const begin = await beginAttempt(page, attemptId, dir, args.waitMs, urls);
      if (!begin.isExam) {
        const summary = { attemptId, at: new Date().toISOString(), begin, problemCount: 0, newCount: 0, submit: null };
        fs.appendFileSync(FAST_JSONL, `${JSON.stringify(summary)}\n`, "utf8");
        console.log(`[${attemptId}] did not enter exam: ${begin.url}`);
        continue;
      }

      const paper = await page.evaluate(async (examId) => fetch(`/exam_room/show_paper?exam_id=${examId}`).then((res) => res.json()), args.examId);
      fs.writeFileSync(path.join(dir, "paper.json"), `${JSON.stringify(paper, null, 2)}\n`, "utf8");
      const problems = paper?.data?.problems || paper?.problems || [];
      const questions = problems.map((problem, problemIndex) => parseProblem(problem, `fast2-paper:${attemptId}:${problemIndex}`));
      const answerDecisions = [];
      for (let problemIndex = 0; problemIndex < problems.length; problemIndex += 1) {
        answerDecisions.push(await answerForWithAI(problems[problemIndex], questions[problemIndex], bank, args, attemptId));
      }
      fs.writeFileSync(path.join(dir, "answer-decisions.json"), `${JSON.stringify(answerDecisions, null, 2)}\n`, "utf8");
      const results = problems.map((problem, problemIndex) => ({
        problem_id: problem.problem_id || problem.ProblemID || problem.id,
        result: answerDecisions[problemIndex].result,
        time: Date.now() + problemIndex
      }));
      const record = results.map((result) => result.problem_id).filter(Boolean);

      const save = await page.evaluate(
        async (payload) =>
          fetch("/exam_room/answer_problem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
            .then((res) => res.json())
            .catch((error) => ({ error: String(error) })),
        { exam_id: args.examId, results, record }
      );
      const submit = await page.evaluate(
        async (payload) =>
          fetch("/exam_room/submit_paper", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
            .then((res) => res.json())
            .catch((error) => ({ error: String(error) })),
        { exam_id: args.examId, results }
      );
      fs.writeFileSync(path.join(dir, "submit.json"), `${JSON.stringify({ save, submit }, null, 2)}\n`, "utf8");

      await page.goto(urls.result, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(args.waitMs);
      const resultText = await page.evaluate(() => document.body.innerText).catch(() => "");
      fs.writeFileSync(path.join(dir, "result.txt"), resultText, "utf8");

      const answerPaper = await page
        .evaluate(async (examId) => fetch(`/exam_room/show_paper?exam_id=${examId}`).then((res) => res.json()), args.examId)
        .catch(() => null);
      fs.writeFileSync(path.join(dir, "answer-paper.json"), `${JSON.stringify(answerPaper, null, 2)}\n`, "utf8");
      const answerProblems = answerPaper?.data?.problems || answerPaper?.problems || problems;
      const answerQuestions = answerProblems.map((problem, problemIndex) => parseProblem(problem, `fast2-answer:${attemptId}:${problemIndex}`));
      let newCount = 0;
      for (const question of answerQuestions) {
        if (mergeQuestion(bank, question, attemptId, page.url())) newCount += 1;
      }
      bank.updatedAt = new Date().toISOString();
      fs.writeFileSync(BANK_PATH, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
      exportBankCsv(bank);

      const summary = {
        attemptId,
        at: new Date().toISOString(),
        begin,
        problemCount: answerQuestions.length,
        newCount,
        save,
        submit,
        scoreText: (resultText.match(/\d+\s*\/\s*15/) || [""])[0],
        answerSources: answerDecisions.reduce((counts, decision) => {
          counts[decision.source] = (counts[decision.source] || 0) + 1;
          return counts;
        }, {}),
        bankTotal: Object.keys(bank.questions).length
      };
      fs.appendFileSync(FAST_JSONL, `${JSON.stringify(summary)}\n`, "utf8");
      stableStreak = answerQuestions.length > 0 && newCount === 0 ? stableStreak + 1 : 0;
      console.log(
        `[${attemptId}] url=${begin.url} problems=${answerQuestions.length} new=${newCount} total=${summary.bankTotal} stable=${stableStreak}/${args.stable} submit=${JSON.stringify(submit).slice(0, 120)}`
      );
      if (stableStreak >= args.stable) {
        console.log(`Stop condition reached: ${args.stable} consecutive attempts with no new questions.`);
        break;
      }
    }
  } finally {
    await context.close();
  }

  const questions = Object.values(bank.questions || {});
  console.log(
    `done total=${questions.length} answered=${questions.filter((question) => (question.correctLabels || []).length || (question.correctTexts || []).length).length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
