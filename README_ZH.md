<p align="center">
  <h1 align="center">Open Claude Cowork</h1>
</p>

<p align="center">
  <img src="open-claude-cowork.gif" alt="Open Claude Cowork 演示" width="800">
</p>

<p align="center">
  <a href="https://docs.composio.dev/tool-router/overview">
    <img src="https://img.shields.io/badge/Composio-Tool%20Router-orange" alt="Composio">
  </a>
  <a href="https://platform.claude.com/docs/en/agent-sdk/overview">
    <img src="https://img.shields.io/badge/Claude-Agent%20SDK-blue" alt="Claude Agent SDK">
  </a>
  <a href="https://github.com/anthropics/claude-code">
    <img src="https://img.shields.io/badge/Powered%20by-Claude%20Code-purple" alt="Claude Code">
  </a>
  <a href="https://twitter.com/composio">
    <img src="https://img.shields.io/twitter/follow/composio?style=social" alt="Twitter">
  </a>
  <a href="https://github.com/ComposioHQ/open-claude-cowork/stargazers">
    <img src="https://img.shields.io/github/stars/ComposioHQ/open-claude-cowork?style=social" alt="GitHub Stars">
  </a>
</p>

<p align="center">
  <strong>唯一一个能真正发送邮件、创建PR、管理日历的开源 Claude Cowork 替代方案。</strong>
</p>

<p align="center">
  其他克隆版本只是 GUI 包装器。这个版本通过 Composio 连接 800+ 真实工具。
</p>

<p align="center">
  <a href="./README.md">English</a> | 简体中文
</p>

<p align="center">
  <a href="https://platform.composio.dev?utm_source=github&utm_medium=readme&utm_campaign=open-claude-cowork">
    <img src="https://img.shields.io/badge/立即开始-Composio%20平台-orange?style=for-the-badge" alt="开始使用 Composio">
  </a>
</p>

---

## 为什么选择这个版本？

市面上有很多 "Claude Cowork" 克隆版本。以下是这个版本的不同之处：

| 功能 | Open Claude Cowork | 其他克隆版本 |
|------|-------------------|-------------|
| **外部工具集成** | 800+ 工具 (Gmail, Slack, GitHub, 日历, Drive, Salesforce, HubSpot, Linear 等) | 无 |
| **多模型支持** | Claude + GPT-5 + Grok + GLM + MiniMax | 仅 Claude |
| **真正执行任务** | 发送邮件、创建PR、安排会议 | 只能聊天 |
| **开源** | 是 | 是 |

**核心区别：** 其他克隆版本只是给 Claude Code 套了个 GUI。我们给 Claude 赋予了超能力。

---

## 使用场景

### 开发者工作流
> "检查我的 GitHub PR 并在 Slack #dev-updates 频道发送摘要"

Claude 通过 GitHub API 读取你的 PR，分析它们，并在 Slack 发送格式化的摘要。

### 邮件处理
> "检查我的 Gmail 中的紧急邮件，并为前3封草拟回复"

Claude 扫描你的收件箱，识别优先邮件，并起草上下文相关的回复。

### 会议准备
> "查看我明天的 Google 日历，并在 Google Drive 创建准备文档"

Claude 获取你的日程安排，并生成包含相关背景的会议简报。

### 代码 + 沟通
> "修复 issue #42 中的 bug，创建 PR，并在 Slack 通知团队"

Claude 阅读 issue，编写修复代码，打开 PR，并发布更新 - 一个提示完成所有操作。

---

## 功能特性

- **多模型支持** - 在 Claude Agent SDK 和 Opencode 之间选择不同的模型选项
- **Claude Agent SDK 集成** - 完整的智能体能力，支持工具使用和多轮对话
- **Opencode SDK 支持** - 访问多个 LLM 提供商 (Claude, GPT-5, Grok, GLM, MiniMax 等)
- **Composio Tool Router** - 访问 800+ 外部工具 (Gmail, Slack, GitHub, Google Drive, Salesforce, HubSpot, Linear 等)
- **持久化聊天会话** - 使用 SDK 会话管理在消息之间保持上下文
- **多聊天支持** - 创建和切换多个聊天会话
- **实时流式传输** - 使用 Server-Sent Events (SSE) 实现流畅的逐字响应
- **工具调用可视化** - 在侧边栏实时查看工具输入和输出
- **进度跟踪** - 待办事项列表集成，跟踪智能体任务进度
- **现代化 UI** - 简洁的深色主题界面，灵感来自 Claude.ai
- **桌面应用** - 原生 Electron 应用，支持 macOS、Windows 和 Linux

---

## 技术栈

| 类别 | 技术 |
|------|------|
| **桌面框架** | Electron.js |
| **后端** | Node.js + Express |
| **AI 提供商** | Claude Agent SDK + Opencode SDK |
| **工具集成** | Composio Tool Router + MCP |
| **流式传输** | Server-Sent Events (SSE) |
| **Markdown** | Marked.js |
| **样式** | 原生 CSS |

---

## 快速开始

### 快速设置（推荐）

```bash
# 克隆仓库
git clone https://github.com/ComposioHQ/open-claude-cowork.git
cd open-claude-cowork

# 运行自动设置脚本
./setup.sh
```

设置脚本将：
- 如果尚未安装，安装 Composio CLI
- 引导你完成 Composio 注册/登录
- 在 `.env` 中配置你的 API 密钥
- 安装所有项目依赖

### 手动设置

如果你更喜欢手动设置，请按照以下步骤操作：

#### 前置条件

- 已安装 Node.js 18+
- **Claude 提供商：**
  - Anthropic API 密钥 ([console.anthropic.com](https://console.anthropic.com))
- **Opencode 提供商：**
  - Opencode API 密钥 ([opencode.dev](https://opencode.dev))
- Composio API 密钥 ([app.composio.dev](https://app.composio.dev))

#### 1. 克隆仓库

```bash
git clone https://github.com/ComposioHQ/open-claude-cowork.git
cd open-claude-cowork
```

#### 2. 安装依赖

```bash
# 安装 Electron 应用依赖
npm install

# 安装后端依赖
cd server
npm install
cd ..
```

#### 3. 配置环境

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 API 密钥：

```env
# Claude 提供商
ANTHROPIC_API_KEY=your-anthropic-api-key

# Opencode 提供商（可选）
OPENCODE_API_KEY=your-opencode-api-key
OPENCODE_HOSTNAME=127.0.0.1
OPENCODE_PORT=4096

# Composio 集成
COMPOSIO_API_KEY=your-composio-api-key
```

**提供商选择：**
- 应用允许在 UI 中切换 **Claude** 和 **Opencode** 提供商
- 只需配置你想使用的提供商的 API 密钥
- Opencode 可以通过单个 SDK 路由到多个模型提供商

### 启动应用

你需要**两个终端窗口**：

**终端 1 - 后端服务器：**
```bash
cd server
npm start
```

**终端 2 - Electron 应用：**
```bash
npm start
```

---

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron 应用                             │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │   主进程        │    │   渲染进程       │                    │
│  │   (main.js)     │    │  (renderer.js)   │                    │
│  └────────┬────────┘    └────────┬─────────┘                    │
│           │                      │                               │
│           └──────────┬───────────┘                               │
│                      │ IPC (preload.js)                          │
└──────────────────────┼───────────────────────────────────────────┘
                       │
                       │ HTTP + SSE
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     后端服务器                                    │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  Express.js     │───▶│ Claude Agent SDK │                    │
│  │  (server.js)    │    │  + 会话管理      │                    │
│  └─────────────────┘    └────────┬─────────┘                    │
│                                  │                               │
│                                  ▼                               │
│                    ┌─────────────────────────┐                   │
│                    │   Composio Tool Router  │                   │
│                    │   (MCP 服务器)          │                   │
│                    └─────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 会话管理

应用使用 Claude Agent SDK 的内置会话管理：
1. 第一条消息创建新会话，返回 `session_id`
2. 后续消息使用 `resume` 选项和存储的会话 ID
3. 完整的对话上下文在服务器端维护

### 工具集成

Composio Tool Router 提供 MCP 服务器集成：
- 工具通过 Composio 仪表板按用户进行身份验证
- 可用工具包括 Google Workspace、Slack、GitHub 以及 800+ 更多工具
- 工具调用实时流式传输并显示

### 提供商架构

应用通过可插拔的提供商系统支持多个 AI 提供商：

#### Claude 提供商
- 使用 Anthropic 的 Claude Agent SDK
- 可用模型：
  - Claude Opus 4.5 (claude-opus-4-5-20250514)
  - Claude Sonnet 4.5 (claude-sonnet-4-5-20250514) - 默认
  - Claude Haiku 4.5 (claude-haiku-4-5-20250514)
- 通过内置 SDK 会话跟踪进行会话管理
- 直接从 Claude API 流式传输

#### Opencode 提供商
- 通过单个 SDK 路由到多个 LLM 提供商
- 可用模型：
  - `opencode/big-pickle` - 免费推理模型（默认）
  - `opencode/gpt-5-nano` - OpenAI 推理模型
  - `opencode/glm-4.7-free` - 智谱 GLM 模型
  - `opencode/grok-code` - xAI Grok 编程模型
  - `opencode/minimax-m2.1-free` - MiniMax 模型
  - `anthropic/*` - 通过 Opencode 访问 Claude 模型
- 基于事件的流式传输，实时部分更新
- 每个聊天对话的会话管理
- 扩展思考支持（推理部分）

**流式传输实现：**
两个提供商都使用 Server-Sent Events (SSE) 进行响应流式传输：
- 后端：Express 服务器通过 HTTP 流式传输规范化的数据块
- 前端：实时处理并渲染 Markdown
- 工具调用：内联显示输入/输出可视化

### MCP 配置（工具集成）

**重要：Opencode 需要在 `server/opencode.json` 中配置 MCP 服务器**

应用在启动时自动更新此文件：
1. 第一次请求时创建带有 MCP URL 的 Composio 会话
2. 后端将 MCP 配置写入 `server/opencode.json`
3. Opencode 读取配置文件并加载 MCP 工具

**文件：`server/opencode.json`**
```json
{
  "mcp": {
    "composio": {
      "type": "remote",
      "url": "https://backend.composio.dev/tool_router/YOUR_ROUTER_ID/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

**注意：** 不要手动编辑此文件 - 它由后端自动生成。占位符会被你的 Composio 会话中的真实凭据替换。

---

## 文件结构

```
open-claude-cowork/
├── main.js                 # Electron 主进程
├── preload.js              # IPC 安全桥接
├── renderer/
│   ├── index.html          # 聊天界面
│   ├── renderer.js         # 前端逻辑和流式处理
│   └── style.css           # 样式
├── server/
│   ├── server.js           # Express + 提供商路由 + MCP 配置写入
│   ├── opencode.json       # MCP 配置（自动生成，见下方说明）
│   ├── providers/
│   │   ├── base-provider.js      # 抽象基类
│   │   ├── claude-provider.js    # Claude Agent SDK 实现
│   │   └── opencode-provider.js  # Opencode SDK 实现
│   └── package.json
├── package.json
├── .env                    # API 密钥（不跟踪）
└── .env.example            # 模板
```

**关于 `server/opencode.json` 的说明：**
- 运行应用时由后端自动生成
- 包含 Composio MCP URL 和凭据
- Opencode 读取此文件以加载工具
- 不要在 git 中跟踪（添加到 `.gitignore` 或使用模板）

---

## 可用脚本

| 命令 | 描述 |
|------|------|
| `npm start` | 启动 Electron 应用 |
| `npm run dev` | 以开发模式启动，支持热重载 |
| `cd server && npm start` | 启动后端服务器 |

---

## 故障排除

**"无法连接到后端"**
- 确保后端服务器在端口 3001 上运行
- 检查终端 1 的错误日志
- 验证防火墙没有阻止 localhost:3001

**"API 密钥错误"**
- Claude：验证 `.env` 中的 `ANTHROPIC_API_KEY` 以 `sk-ant-` 开头
- Opencode：确保 `OPENCODE_API_KEY` 有效且来自 opencode.dev
- 确保 `COMPOSIO_API_KEY` 有效

**"提供商不可用"**
- 确保在 `.env` 中配置了所需的 API 密钥
- 更改 `.env` 后重启后端服务器
- 检查服务器日志中的初始化错误

**"会话未持久化"**
- 检查服务器日志中的会话 ID 捕获
- 确保从前端传递了 `chatId`
- 不同的提供商使用不同的会话机制（Claude SDK vs Opencode 会话）

**"流式传输似乎很慢或不完整"**
- 检查 SSE 连接的网络/防火墙设置
- 验证后端正在从提供商 SDK 接收事件
- 检查浏览器控制台的连接错误
- Opencode：确保事件订阅正在接收 `message.part.updated` 事件

**"Opencode 模型没有响应"**
- 验证 Opencode 服务器正在运行（localhost:4096 或配置的 URL）
- 检查模型标识符是否匹配 Opencode 格式（例如 `opencode/big-pickle`）
- 查看 Opencode API 文档了解可用模型
- 检查服务器日志中的 Opencode SDK 初始化错误

---

## 贡献

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

---

## 资源

- [Claude Agent SDK 文档](https://docs.anthropic.com/en/docs/claude-agent-sdk)
- [Opencode SDK 文档](https://docs.opencode.dev)
- [Composio Tool Router](https://docs.composio.dev/tool-router)
- [Composio 仪表板](https://app.composio.dev)
- [Electron 文档](https://www.electronjs.org/docs)
- [Opencode 平台](https://opencode.dev)

---

<p align="center">
  使用 Claude Code 和 Composio 构建
</p>
