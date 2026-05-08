# Rain Classroom Practice Automation

Local automation for authorized Rain Classroom / Yuketang practice quizzes. It uses Playwright to open a quiz page, collect randomized practice questions, build a local question bank, optionally fill known answers, and export review files.

Use this only with your own account, on practice activities where repeated attempts are allowed and the activity is not graded. Do not use it for exams, graded assignments, other people's accounts, or any workflow that violates platform or course rules.

## Features

- Opens a Rain Classroom practice quiz from a user-provided URL.
- Collects questions from page text, HTML, screenshots, and JSON responses.
- Deduplicates questions by normalized stem and options.
- Stores local JSON / CSV question-bank outputs under `data/`.
- Optionally fills known answers from the local bank.
- Optionally asks an OpenAI model for unknown-question suggestions.
- Exports a formatted DOCX review document from a local question bank.

## Install

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

The DOCX exporter also needs `python-docx`:

```powershell
python -m pip install python-docx
```

## Basic Usage

First run with a visible browser so you can sign in manually:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --unknown-policy skip --max-attempts 1
```

After confirming the activity is an authorized non-graded practice and repeated submissions are allowed, you can run repeated collection:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --loop --stable 3 --auto-fill --auto-submit --unknown-policy random
```

Useful options:

- `--loop`: repeat attempts.
- `--stable <n>`: stop after `n` consecutive attempts with no newly discovered questions.
- `--max-attempts <n>`: safety cap for repeated runs.
- `--auto-fill`: fill answers that are already known in the local bank.
- `--auto-submit`: submit attempts automatically. Use only for authorized non-graded practice.
- `--unknown-policy skip|first|random`: how to handle unknown questions when AI is disabled or no AI answer is usable.
- `--browser-channel msedge|chrome`: use an installed browser channel instead of bundled Chromium.
- `--headed false`: run headless after login is already working.
- `--cookies <file>`: load cookies from a local JSON file. Never commit real cookies.

## AI Suggestions

AI is disabled by default. It only runs when a question is not answered by the local bank. Suggestions are logged to `data/ai-suggestions.jsonl`.

Set an OpenAI API key in your local shell:

```powershell
$env:OPENAI_API_KEY="<your-api-key>"
```

Record suggestions only:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-suggest --unknown-policy skip
```

Fill only when the model reports enough confidence:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-fill --ai-min-confidence 0.85 --unknown-policy skip
```

Force-fill unknown questions with AI suggestions:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-force-fill --unknown-policy skip
```

`--ai-force-fill` can be wrong. The script records the source as `ai-force`; it does not turn AI guesses into standard answers. Standard answers should come only from a known local bank or from post-submit result data.

## Fast Runner

The fast runner is for cases where you already know the real exam-room ID used by the answer page. It goes directly through the exam-room routes and is less portable than the normal URL runner.

```powershell
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 50 --stable 3 --time-budget-sec 900
```

AI modes are also supported:

```powershell
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 10 --stable 3 --ai-suggest
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 10 --stable 3 --ai-fill --ai-min-confidence 0.85
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 10 --stable 3 --ai-force-fill
```

Do not commit real exam IDs or raw run output.

## Outputs

- `data/question-bank.json`: main local question bank.
- `data/question-bank.csv`: UTF-8 BOM CSV export for spreadsheet apps.
- `data/attempts.jsonl`: normal runner attempt summaries.
- `data/fast-attempts.jsonl`: fast runner attempt summaries.
- `data/ai-suggestions.jsonl`: AI suggestions for unknown questions.
- `data/raw/attempt-*` and `data/raw/fast2-*`: raw text, HTML, screenshots, and JSON responses for debugging.
- `question_bank_review.docx`: formatted DOCX review document generated from a local bank.

`data/`, `secrets/`, `.playwright-profile/`, rendered files, spreadsheets, and DOCX outputs are ignored by default.

## Generate A DOCX Review File

```powershell
python scripts\create_question_bank_docx.py
```

Custom output:

```powershell
python scripts\create_question_bank_docx.py --out "question_bank_review.docx" --title "Practice Question Bank Review"
```

The exporter sets an East Asian font for Chinese text and includes a small mojibake repair fallback for text that was accidentally decoded with the wrong encoding.

## Privacy And Publishing

Before publishing or sharing a repository, verify that it does not contain:

- real cookies, session IDs, CSRF tokens, or API keys;
- `.playwright-profile/` browser state;
- `data/` run output, raw JSON, screenshots, or question banks;
- real course URLs, classroom IDs, user IDs, exam IDs, or leaf IDs;
- generated DOCX / CSV / XLSX review files.

See [docs/WORKFLOW.md](docs/WORKFLOW.md) for the workflow and [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md) for the publishing checklist.
