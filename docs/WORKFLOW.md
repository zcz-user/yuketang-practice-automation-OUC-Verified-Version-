# 使用流程

这个文档说明一个通用的、仅限本人账号的非计分练习流程，不包含真实课程链接、ID、题目或账号状态。

## 1. 使用边界

只在这些条件都满足时使用：

- 你在自己的账号上操作。
- 目标是练习，不是计分考试或作业。
- 允许重复作答。
- 允许本地整理自己的练习材料。

不要公开分享原始运行输出、题库、截图、cookie、登录状态、真实 URL 或各类 ID。

## 2. 项目结构

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
|-- data/                 # 本地输出，默认忽略
`-- .playwright-profile/  # 本地浏览器状态，默认忽略
```

普通模式更通用，因为它从网页 URL 开始，由页面和网络响应自己识别题目。快模式更直接，但需要真实的答案页 `exam_id`，因此可移植性差一些。

## 3. 安装

```powershell
npm.cmd install
npx.cmd playwright install chromium
python -m pip install python-docx
```

## 4. 登录

建议流程：

1. 用普通模式打开可见浏览器。
2. 在浏览器里手动登录。
3. 登录状态会保存在 `.playwright-profile/`，方便以后本机继续用。

也支持 cookie 导入：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --cookies "secrets/yuketang-cookies.json"
```

真实 cookie 不要提交到仓库。

## 5. 普通模式

先做一次不提交的烟雾测试：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --unknown-policy skip --max-attempts 1
```

需要重复收集时：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --loop --stable 3 --auto-fill --auto-submit --unknown-policy random
```

普通模式会：

- 打开你给的练习链接；
- 点击开始 / 重做 / 继续之类的入口；
- 等到真正的题目页出现，而不是把加载壳当成题目页；
- 从 DOM 文本和 JSON 响应里抓题；
- 按题干和选项去重；
- 在需要时填入本地已知答案；
- 把运行证据写到 `data/raw/`。

## 6. 快速模式

只在你已经知道答案页 `exam_id` 后使用：

```powershell
npm.cmd run fast -- --exam-id "<exam_id>" --attempts 50 --stable 3 --time-budget-sec 900
```

它会把每轮的试卷、答题决策、提交、结果和答案页数据写到 `data/raw/fast2-*`。

不要把真实 ID 写进示例、文档、提交记录或截图里。

## 7. AI 层

AI 是可选的，只在题库里没有答案时使用。

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

强制填：

```powershell
npm.cmd run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --ai-force-fill --unknown-policy skip
```

说明：

- AI 建议会写入 `data/ai-suggestions.jsonl`。
- AI 可能答错。
- AI 结果不是标准答案。
- 标准答案应当来自本地题库或结果页回收。

## 8. 本地数据模型

每道题按“归一化题干 + 选项”生成指纹。合并时可以增加：

- `seenCount`
- `firstSeenAt`
- `lastSeenAt`
- `attempts`
- `correctLabels`
- `correctTexts`
- `explanation`
- `sources`

这样同一道题多次随机出现时不会重复入库，但后续还能补齐答案。

## 9. 编码说明

PowerShell 有时会把中文显示乱掉，但文件本身可能是正常 UTF-8。建议用支持 UTF-8 的编辑器，或者用 Node / Python 直接读文件。

项目约定：

- JavaScript 读写统一用 `utf8`。
- CSV 导出带 UTF-8 BOM，方便表格软件识别。
- 终端里可能乱掉的 UI 字符串可以改成 Unicode 转义。
- DOCX 导出会给中文设置 East Asian 字体。
- DOCX 导出包含一个保守的乱码修复步骤。

## 10. Word 导出

```powershell
python scripts\create_question_bank_docx.py
```

自定义：

```powershell
python scripts\create_question_bank_docx.py --bank "data/question-bank.json" --out "question_bank_review.docx" --title "Practice Question Bank Review"
```

生成文件属于本地输出，不要提交。

## 11. 排错

- 登录失败时，先用可见浏览器手动登录一次。
- 如果进入答案页后抓到 0 题，先看 `data/raw/attempt-*`，确认是不是只进到了加载页。
- 如果多轮都没有新题，检查 `data/attempts.jsonl` 或 `data/fast-attempts.jsonl`，确认有没有真的进入答题页。
- 如果 CSV 在表格软件里乱码，检查文件头是否有 UTF-8 BOM。
- 如果 Word 字体怪，确认系统有 `Microsoft YaHei`，或者改 `scripts/create_question_bank_docx.py` 里的 `FONT_BODY`。
