<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-success?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Node-18%2B-339933?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/Playwright-Enabled-45ba4b?style=flat-square&logo=playwright" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" />
</p>

<h1 align="center">
  🎓 雨课堂练习自动化
</h1>
<h3 align="center">
  Yuketang Practice Automation — OUC Verified Version
</h3>
<p align="center">
  <em>收集随机题目 · 建立本地题库 · 自动填充 · 导出复习文档</em>
</p>

<p align="center">
  <a href="#-功能">功能</a> •
  <a href="#-安装">安装</a> •
  <a href="#-基本用法">基本用法</a> •
  <a href="#-AI-辅助">AI 辅助</a> •
  <a href="#-参数说明">参数说明</a> •
  <a href="#-项目结构">项目结构</a>
</p>

---

## 📖 简介

由 ZCZ-User 维护的 **雨课堂 / 学堂在线** 练习题自动化工具。它可以：

1. 打开练习页面，收集随机题目
2. 建立本地题库（按题干和选项去重）
3. 自动填充已知答案
4. 记录 AI 辅助建议
5. 导出排版精美的 Word / CSV 复习文档

> **适用场景：** 本人账号下可重复作答的练习活动。
> ✅ 纯本地运行 · ✅ 无数据外泄 · ✅ 支持 AI 辅助

---

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 🔍 **题目收集** | 自动从页面文本、HTML、截图、JSON 响应中收集题目 |
| 🗂️ **本地题库** | 按题干+选项去重，持久化存储 |
| ✏️ **自动填充** | 从本地题库匹配并填入已知答案 |
| 🤖 **AI 辅助** | 未知题目调用 AI 获取建议（可选） |
| 📄 **导出复习文档** | 导出为 Word (.docx) 或 CSV 格式 |
| 🔄 **循环模式** | 自动循环尝试，直到没有新题 |
| 💾 **Cookies 管理** | 支持加载/保存登录状态 |

---

## 🚀 快速开始

### 安装

```powershell
# 安装 Node 依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 导出 Word 还需 Python 依赖
python -m pip install python-docx
```

### 首次使用：手动登录

```powershell
npm run ykt -- --url "https://example.com/path/to/practice/quiz" --auto-fill --unknown-policy skip --max-attempts 1
```

首次运行会在可见浏览器中打开页面，请手动扫码/账号登录。登录成功后 Cookie 会自动保存。

### 循环收集模式

确认是允许重复作答的练习后：

```powershell
npm run ykt -- --url "https://example.com/path/to/practice/quiz" --loop --stable 3 --auto-fill --auto-submit --unknown-policy random
```

### 导出复习文档

```powershell
python scripts/create_question_bank_docx.py
```

---

## ⚙️ 参数说明

| 参数 | 说明 |
|------|------|
| `--url` | 练习页面 URL（必填） |
| `--loop` | 循环尝试模式 |
| `--stable <n>` | 连续 `n` 次没有新题后停止 |
| `--max-attempts <n>` | 最大尝试次数 |
| `--auto-fill` | 从本地题库自动填充 |
| `--auto-submit` | 自动交卷（仅限可重复作答的练习） |
| `--unknown-policy` | 未知题策略：`skip`（跳过）/ `first`（选第一个）/ `random`（随机选） |
| `--browser-channel` | 使用已安装浏览器：`msedge` / `chrome` |
| `--headed` | 有头模式（`true`）/ 无头模式（`false`） |
| `--cookies` | 加载本地 cookies 文件路径 |

---

## 🤖 AI 辅助

AI 默认关闭，只在本地题库没有答案时才会使用。

### 配置

```powershell
# 设置 OpenAI API Key
$env:OPENAI_API_KEY="<your-api-key>"
```

### 仅记录建议（不自动填写）

```powershell
npm run ykt -- --url "https://..." --auto-fill --ai-suggest --unknown-policy skip
```

### 高置信度才填写

```powershell
npm run ykt -- --url "https://..." --auto-fill --ai-fill --ai-min-confidence 0.85 --unknown-policy skip
```

AI 建议会记录到 `data/ai-suggestions.jsonl`，方便人工审核。

---

## 📁 项目结构

```
├── src/
│   ├── yuketang-runner.js        # 主运行逻辑
│   ├── yuketang-fast-runner.js   # 快速运行模式
│   └── ai-inference.js           # AI 推断模块
├── scripts/
│   └── create_question_bank_docx.py  # Word 导出脚本
├── docs/
│   └── WORKFLOW.md               # 工作流程文档
├── secrets/
│   └── yuketang-cookies.example.json  # Cookie 配置示例
├── package.json
├── .gitignore
└── README.md
```

---

## 🔒 安全说明

- 所有数据仅保存在本地，不上传任何服务器
- API Key 仅通过环境变量传入，不会落盘
- Cookie 文件请妥善保管，避免泄露

---

## 📄 License

MIT © [zcz-user](https://github.com/zcz-user)
