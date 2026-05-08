# 开源发布检查

这个仓库可以作为一个通用的、仅供本地使用的练习题自动化工具来发布。公开仓库里不要放真实课程数据、账号状态或已收集的题库。

## 保留内容

- `src/`
- `scripts/`
- `docs/`
- `README.md`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `secrets/yuketang-cookies.example.json`（只保留占位符）

## 不要放入仓库

- `data/`
- `.playwright-profile/`
- `docx_render/`
- 真实 cookie 文件
- `.env`
- API key
- 生成的 `.docx`、`.csv`、`.xlsx`、`.pdf`、`.png`
- 真实课程 URL、课堂 ID、用户 ID、考试 ID、叶节点 ID、截图、原始 JSON 响应、题库内容

## `.gitignore`

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

## 发布前检查

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
git status --short
git diff --cached --stat
git diff --cached
```

如果已经把私密信息提交进历史，单纯追加一个“删除”提交不够，要重写公开历史，或者重新建一个干净仓库。

## 对外表述

建议写法：

- 本地练习题收集与复习整理；
- 仅限本人账号、非计分练习；
- 可选的 AI 辅助答题建议；
- 本地优先，隐私优先。

不要写成：

- 旁路平台；
- 破解或攻击雨课堂；
- 自动做计分作业；
- 分发课程题库。

## cookie 说明

示例 cookie 文件只是结构占位符。真实 cookie 属于登录态，必须留在本地；如果曾经泄露，应及时更换。
