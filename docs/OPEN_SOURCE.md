# Open Source Checklist

This project can be published as a generic, local, authorized practice-question archiving tool. The public repository must not include real course data, account state, or collected question banks.

## Keep In The Repository

- `src/`
- `scripts/`
- `docs/`
- `README.md`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `secrets/yuketang-cookies.example.json` with placeholder values only

## Keep Out Of The Repository

- `data/`
- `.playwright-profile/`
- `docx_render/`
- real cookie files
- `.env`
- API keys
- generated `.docx`, `.csv`, `.xlsx`, `.pdf`, and `.png` files
- real course URLs, classroom IDs, user IDs, exam IDs, leaf IDs, screenshots, raw JSON responses, and question-bank content

## Required `.gitignore`

```text
node_modules/
data/
secrets/
!secrets/yuketang-cookies.example.json
.playwright-profile/
docx_render/
.env
*.log
*.docx
*.xlsx
*.csv
*.pdf
*.png
```

## Sensitive-Content Scan

Run a scan before every public push:

```powershell
$patterns = @(
  ('session' + 'id'),
  ('csrf' + 'token'),
  ('OPENAI_API_KEY=' + 'sk-'),
  ('sk-' + '[A-Za-z0-9_-]{20,}'),
  ('/lms/' + '[^/]+/\d+/exam/\d+'),
  ('exam_' + 'id["'']?\s*:'),
  ('user_' + 'id["'']?\s*:'),
  ('classroom_' + 'id["'']?\s*:'),
  ('leaf_type_' + 'id'),
  ('changjiang-exam.yuketang.cn/' + '(cover|start|result)/\d+')
)

Select-String -Path README.md,docs\*.md,src\*.js,scripts\*.py,package.json,secrets\*.json -Pattern $patterns
```

Also check the Git staging area:

```powershell
git status --short
git diff --cached --stat
git diff --cached
```

If you have already committed private information, deleting it in a later commit is not enough. Rewrite the public history before pushing, or create a new clean repository.

## Public Positioning

Recommended framing:

- authorized practice-question archiving;
- local review-bank generation;
- optional AI answer suggestions for human review;
- privacy-first local outputs.

Avoid framing such as:

- bypassing a platform;
- cracking or attacking Rain Classroom;
- auto-solving graded work;
- distributing course question banks.

## Cookie Handling

The example cookie file is only a schema placeholder. Real cookies are login state. They must remain local and should be rotated if accidentally exposed.
