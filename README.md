# 雨课堂练习自动化

由 ZCZ-User 维护的雨课堂 / 学堂在线练习题自动化工具。它可以打开练习页面、收集随机题目、建立本地题库、自动填充已知答案，并导出复习文档。

适用于本人账号下可重复作答的练习活动。

## 功能

- 打开用户提供的练习 URL。
- 从页面文本、HTML、截图和 JSON 响应中收集题目。
- 按题干和选项去重，形成本地题库。
- 可按本地题库自动填充已知答案。
- 可调用 OpenAI 做未知题目的辅助建议。
- 可把本地题库导出为排版好的 Word 复习文档。

## 安装

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

导出 Word 还需要：

```powershell
python -m pip install python-docx
```

## 基本用法

先用可见浏览器跑一次，手动登录：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --unknown-policy skip --max-attempts 1
```

确认是允许重复作答的练习后，可反复收集：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --loop --stable 3 --auto-fill --auto-submit --unknown-policy random
```

常用参数：

- `--loop`：循环尝试。
- `--stable <n>`：连续 `n` 次没有新题后停止。
- `--max-attempts <n>`：最大尝试次数。
- `--auto-fill`：填入本地题库里已知答案。
- `--auto-submit`：自动交卷，仅限允许重复作答的练习。
- `--unknown-policy skip|first|random`：未知题处理策略。
- `--browser-channel msedge|chrome`：使用已安装浏览器。
- `--headed false`：登录稳定后可改为无头模式。
- `--cookies <file>`：加载本地 cookies 文件。

## AI 辅助

AI 默认关闭，只在题库里没有答案时才会用。建议写入 `data/ai-suggestions.jsonl`。

设置 API Key：

```powershell
$env:OPENAI_API_KEY="<your-api-key>"
```

只记录建议：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-suggest --unknown-policy skip
```

高置信度才填：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-fill --ai-min-confidence 0.85 --unknown-policy skip
```

强制用 AI 填：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-force-fill --unknown-policy skip
```

`--ai-force-fill` 可能会错。AI 结果只算辅助建议，不应当作标准答案来源。

## 快速模式

如果你已经知道答案页的 `exam_id`，可以直接走快模式：

```powershell
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 50 --stable 3 --time-budget-sec 900
```

也支持 AI：

```powershell
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 10 --stable 3 --ai-suggest
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 10 --stable 3 --ai-fill --ai-min-confidence 0.85
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 10 --stable 3 --ai-force-fill
```

## 输出

- `data/question-bank.json`：本地题库主文件。
- `data/question-bank.csv`：给表格软件用的 CSV。
- `data/attempts.jsonl`：普通模式尝试记录。
- `data/fast-attempts.jsonl`：快模式尝试记录。
- `data/ai-suggestions.jsonl`：AI 建议记录。
- `data/raw/attempt-*` 和 `data/raw/fast2-*`：调试用原始文本、HTML、截图和 JSON。
- `question_bank_review.docx`：本地题库导出的 Word 复习文档。

## 生成 Word 复习文档

```powershell
python scripts\create_question_bank_docx.py
```

自定义输出：

```powershell
python scripts\create_question_bank_docx.py --out "question_bank_review.docx" --title "Practice Question Bank Review"
```
