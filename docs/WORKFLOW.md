# Workflow

This document explains the generic workflow for using the project on an authorized non-graded practice quiz. It intentionally uses placeholders and does not include real course links, IDs, collected questions, or account state.

## 1. Boundaries

Use the tool only when all of these are true:

- You are using your own account.
- The activity is a practice activity, not a graded exam or assignment.
- Repeated attempts are allowed.
- Local archiving of your own practice material is allowed.

Do not publish or share raw run output, collected question banks, screenshots, cookies, login state, real URLs, or IDs.

## 2. Project Layout

```text
.
|-- src/
|   |-- yuketang-runner.js
|   |-- yuketang-fast-runner.js
|   `-- ai-inference.js
|-- scripts/
|   `-- create_question_bank_docx.py
|-- secrets/
|   `-- yuketang-cookies.example.json
|-- docs/
|-- data/                 # local output, ignored
`-- .playwright-profile/  # local browser state, ignored
```

The normal runner is more portable because it starts from the web quiz URL and learns page metadata from the UI/network responses. The fast runner is more direct but requires the real exam-room ID and is therefore less portable.

## 3. Install

```powershell
npm.cmd install
npx.cmd playwright install chromium
python -m pip install python-docx
```

## 4. Login

Recommended local login flow:

1. Run the normal runner in headed mode.
2. Sign in in the opened browser.
3. The browser state is stored in `.playwright-profile/` for future local runs.

Cookie import is also supported for local debugging:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --cookies "secrets/yuketang-cookies.json"
```

Never commit or publish real cookies.

## 5. Normal Runner

Smoke test without submitting:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --unknown-policy skip --max-attempts 1
```

Repeated authorized practice collection:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --loop --stable 3 --auto-fill --auto-submit --unknown-policy random
```

What the runner does:

- opens the user-provided practice URL;
- clicks start / retry / continue style entry points;
- waits until a real question is loaded instead of treating a loading shell as a question page;
- extracts questions from DOM text and JSON responses;
- deduplicates by normalized question stem and options;
- fills known local-bank answers when requested;
- records run evidence under `data/raw/`.

## 6. Fast Runner

The fast runner is useful only after you know the real answer-page exam ID:

```powershell
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 50 --stable 3 --time-budget-sec 900
```

It stores per-attempt paper, answer decision, submit, result, and answer-paper data under `data/raw/fast2-*`.

Do not write real IDs into examples, docs, commits, issues, or screenshots.

## 7. AI Layer

AI is optional and local. It only runs for unknown questions.

```powershell
$env:OPENAI_API_KEY="<your-api-key>"
```

Suggestion-only mode:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-suggest --unknown-policy skip
```

Confidence-gated fill mode:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-fill --ai-min-confidence 0.85 --unknown-policy skip
```

Force-fill mode:

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-force-fill --unknown-policy skip
```

Notes:

- AI suggestions are logged to `data/ai-suggestions.jsonl`.
- AI output can be wrong.
- AI guesses are not standard answers.
- The local bank should treat standard answers as coming from known bank data or result-page recovery, not from AI guesses.

## 8. Local Data Model

Each question is stored by a fingerprint made from normalized question stem and options. Merge updates can add:

- `seenCount`
- `firstSeenAt`
- `lastSeenAt`
- `attempts`
- `correctLabels`
- `correctTexts`
- `explanation`
- `sources`

This keeps repeated random appearances from duplicating the same question while still allowing later attempts to fill in missing answers.

## 9. Encoding Notes

PowerShell output can look garbled even when the file is valid UTF-8. Check real file content with a UTF-8-aware editor or by reading it with Node/Python.

Project practices:

- JavaScript reads and writes text files with `utf8`.
- CSV export starts with a UTF-8 BOM for spreadsheet compatibility.
- UI strings that must survive terminal encoding problems can be written as Unicode escapes.
- The DOCX exporter sets `w:eastAsia` font attributes for Chinese text.
- The DOCX exporter includes a conservative repair step for common UTF-8 text that was accidentally decoded as GBK.

## 10. DOCX Review Export

```powershell
python scripts\create_question_bank_docx.py
```

Custom:

```powershell
python scripts\create_question_bank_docx.py --bank "data/question-bank.json" --out "question_bank_review.docx" --title "Practice Question Bank Review"
```

Generated documents are local outputs and should not be committed.

## 11. Troubleshooting

If login fails, run headed mode and sign in manually once.

If the runner captures zero questions after entering an answer page, check the newest `data/raw/attempt-*` folder. Loading-only pages should show text such as `/0 questions` or `loading`; current runner versions wait for real question signals before capture.

If repeated attempts do not discover new questions, inspect `data/attempts.jsonl` or `data/fast-attempts.jsonl` and verify that attempts actually entered the answer page.

If CSV opens garbled in a spreadsheet app, confirm the exported file begins with UTF-8 BOM.

If DOCX font rendering looks strange, confirm the system has `Microsoft YaHei` or change `FONT_BODY` in `scripts/create_question_bank_docx.py`.
