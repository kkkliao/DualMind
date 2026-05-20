# DualMind

简体中文 | [English](README.md)

DualMind 是一个本地运行的双 AI 群组协作平台，把用户、OpenClaw、Hermes 放进同一个可审计的三人群聊里。日常对话时两个 AI 都可以自然发言、纠错和补充；执行代码、命令、文件修改这类任务时，系统只允许当前主 AI 持有执行权，副 AI 负责复核、校准、辩论和提出建议，避免两个 agent 同时抢操作。

相比只依赖单个模型或单个 agent，DualMind 的双 AI 群组能让两个独立 AI 对同一个问题进行交叉检查、观点补充和多轮辩论。一个 AI 给出方案，另一个 AI 可以及时指出遗漏、事实错误、角色越界或潜在风险；最后再由当前主 AI 收敛成可执行结论。这种协作方式可以更有效地降低幻觉和低级错误，提高复杂任务中的判断质量、代码可靠性和执行安全性。

DualMind 对接的是 OpenClaw 和 Hermes 这两个 agent 系统，不绑定具体模型或 provider。OpenClaw/Hermes 背后可以是 DeepSeek、MiniMax、OpenAI、Anthropic、OpenRouter 或其他服务，具体模型配置由 OpenClaw 和 Hermes 自己负责。

> 当前版本适合本地 macOS 预览和小范围试用。Windows、微信直连双 AI 自动回复、真实 token 级流式输出仍在打磨中。

## 为什么值得关注

- **像群聊一样协作**：用户、OpenClaw、Hermes 在同一条对话流里交流，不是简单的左右分栏或串行调用。
- **双 AI 交叉复核**：两个 agent 可以互相补充、质疑和纠错，比单模型独立回答更容易发现幻觉、遗漏和不合理方案。
- **执行权不打架**：只有两个角色模式：OpenClaw 主 / Hermes 副，或 Hermes 主 / OpenClaw 副。主 AI 执行，副 AI 复核。
- **点名优先但不抢权**：`@OpenClaw` / `@Hermes` 只改变谁先回答，不改变当前主副关系。
- **日常自由发言**：普通聊天不会让副 AI 静默；两个 AI 都可以补充观点、指出错误、完成确认。
- **执行复核闭环**：副 AI 提出风险或优化点后，主 AI 必须公开回应：采纳、请求用户确认，或说明不采纳原因。
- **远程通道安全优先**：微信消息可以进入 DualMind 的 turn 记录；远程代码/命令类请求默认不会直接执行。
- **中英文界面**：主界面、设置页、引导页、说明页和角色模式文案均提供中文 / 英文适配。

## 核心功能

- 本地 Web 群聊界面
- 首次启动引导页
- OpenClaw / Hermes 路径检测和真实回复测试
- 两种主副角色模式
- Action Lease 执行权租约
- 副 AI 只读复核路径
- 日常纠偏和确认收口
- 执行任务的主 AI 二次收口
- SSE 思考动画和模拟渐进式输出
- 本地聊天记录和结构化 turn 记录
- 回合面板：重试、取消、导出、继续远程消息
- 可选微信接入入口
- macOS 后台常驻服务脚本
- 自动化测试和 i18n key 检查

## 安装要求

- Node.js 22+
- npm
- OpenClaw CLI
- Hermes CLI

微信官方插件也要求 Node.js 22+。模型/provider 不在 DualMind 中配置，请先分别完成 OpenClaw 和 Hermes 的模型配置。

## 快速开始

```bash
git clone https://github.com/kkkliao/DualMind.git
cd DualMind
npm install
cp .env.example .env
npm start
```

如果你已经配置了 GitHub SSH，也可以使用 `git@github.com:kkkliao/DualMind.git` 克隆。

打开：

```text
http://127.0.0.1:3000
```

第一次运行或 `config.json` 不完整时，主页会自动进入引导页：

```text
http://127.0.0.1:3000/setup
```

引导页会检测 OpenClaw / Hermes 路径、OpenClaw Gateway URL、角色模式和安全偏好。保存后，服务端会在本机生成私有的 `config.json`。公开仓库只提交 `config.example.json`，不要提交自己的 `config.json`。

## 角色模式

DualMind 只有两个角色模式：

| 模式 | 执行者 | 复核者 |
| --- | --- | --- |
| `openclaw-main` | OpenClaw | Hermes |
| `hermes-main` | Hermes | OpenClaw |

日常聊天中，OpenClaw 和 Hermes 都是群成员，都可以发言。点名只决定发言顺序：

```text
@Hermes 先从安全角度看一下
@OpenClaw 你先给一个执行方案
你们俩讨论一下这个架构升级顺序
```

当请求涉及写文件、运行命令、改配置、生成项目等真实操作时，当前主 AI 是唯一执行者；副 AI 只能公开沟通、校准、辩论、复核和提示风险，不能说自己已经执行，也不能说“等我拿到执行权再写”。

## 工作原理

DualMind 由这些模块组成：

- `server.js`：Express 服务、配置保存、SSE 输出、API 路由。
- `public/`：聊天页、设置页、引导页、说明页和 i18n 文案。
- `src/agents/`：OpenClaw / Hermes adapter。
- `src/coordinator/`：角色、意图、执行权、策略警告、远程安全策略。
- `src/store/`：配置、turn、task 的本地存储。
- `src/streaming/`：SSE writer 和模拟渐进式输出。
- `test/`：自动化测试。

Turn 状态包括：

| 状态 | 含义 |
| --- | --- |
| `done` | 本轮需要回复的 agent 都成功完成 |
| `partial` | 至少一个 agent 成功、至少一个 agent 失败 |
| `error` | 本轮没有 agent 成功回复 |
| `needs-confirmation` | 检测到危险操作，等待用户确认 |
| `queued` | 远程通道消息已进入 DualMind，等待用户在 Web UI 中继续 |
| `cancelled` | 用户取消了未完成或等待确认的回合 |
| `rejected` | 执行权租约或安全策略拒绝本轮 |

## 配置

主要配置在本机私有的 `config.json`，仓库提供 `config.example.json` 作为模板：

```json
{
  "setup": {
    "completed": true,
    "language": "zh"
  },
  "openclaw": {
    "binPath": "",
    "gatewayUrl": "http://127.0.0.1:18789",
    "mode": "agent",
    "agentId": "main"
  },
  "hermes": {
    "binPath": ""
  },
  "roleMode": "openclaw-main"
}
```

环境变量见 `.env.example`：

```bash
DUALMIND_HOST=127.0.0.1
DUALMIND_PORT=3000
OPENCLAW_BIN=
HERMES_BIN=
```

`openclaw.mode` 默认为 `agent`，这样 OpenClaw 作为主 AI 时可以真实处理代码、命令和文件任务。如果切到 `infer`，OpenClaw 会被视为只读聊天/规划能力，执行类请求会被阻断，直到切回 `agent` 或改用 Hermes 主模式。

## 后台常驻服务

网页只是 DualMind 的控制台；微信 webhook、远程消息排队、turn 写入和 agent 调用都由后端服务负责。浏览器标签页可以关闭，但后端必须保持运行。

开发时：

```bash
npm start
```

macOS 登录后常驻：

```bash
npm run service:install
npm run service:status
```

常用命令：

```bash
npm run service:start
npm run service:stop
npm run service:restart
npm run service:uninstall
```

服务文件会写入 `~/Library/LaunchAgents/local.dualmind.server.plist`，日志保存在 `data/logs/`。

## 微信集成

DualMind 已把腾讯微信官方 OpenClaw 插件和安装器作为项目依赖集成：

- `@tencent-weixin/openclaw-weixin`
- `@tencent-weixin/openclaw-weixin-cli`
- `qrcode`

用户不需要手动复制 `npx -y @tencent-weixin/openclaw-weixin-cli@latest install`。设置页的“安装/修复微信官方插件”会调用项目依赖里的官方安装器；“获取二维码”会调用官方插件扫码流程，生成真实微信扫码链接并在页面渲染二维码。

当前边界：

- 一台本地 DualMind 设备只保留一个当前微信账号。
- 官方扫码链路首先连接到 OpenClaw Gateway 的 `openclaw-weixin` channel。
- DualMind 自带 `/api/wechat` webhook 当前是安全排队路径：远程消息进入 turn 记录，由用户回到 Web UI 确认后继续。
- 微信里直接自动收到 `OpenClaw：...` / `Hermes：...` 双 AI 回复，需要后续 DualMind 微信桥接层继续实现。
- 远程 coding/risky 请求不会直接执行代码或命令。

## 安全与隐私

建议保持服务绑定在 `127.0.0.1`。

原则：

- 聊天自由，执行加锁。
- 当前主 AI 才能声称执行代码、命令或文件修改。
- 副 AI 只能建议、复核、请求修改或阻断风险。
- 危险操作需要用户确认。
- 远程消息默认不直接触发代码修改。
- 本地聊天、turn、task、健康检查和日志都不应提交到公开仓库。

默认 `.gitignore` 已排除：

- `.env`
- `config.json`
- `node_modules/`
- `data/*.json`
- `data/logs/`
- 本地日志、缓存、系统文件

## 平台状态

| 平台 | 状态 |
| --- | --- |
| macOS | 主要路径已打通：网页服务、引导页、设置页、OpenClaw/Hermes 检测、后台服务、微信插件入口 |
| Windows | Node/Express 和前端理论可运行，但后台常驻、路径检测、微信插件安装/登录流程仍需专项验证 |
| Linux | 未专项验证；Node 服务应具备移植基础，但服务脚本和 agent 路径需要补齐 |

建议首次 GitHub 发布标记为 `alpha` 或 `preview`，等 Windows/Linux 常驻方案、微信桥接层、截图和干净机器安装测试完成后再标记稳定版。

## 开发与自检

```bash
npm run dev
npm run verify
```

单独测试：

```bash
npm run check
npm test
npm run i18n:check
```

当前测试覆盖角色模式、点名优先、执行权租约、执行复核、副 AI 只读复核、策略警告、远程安全策略、WeChat channel、adapter 能力协议、JSON 输出解析、SSE、turn/task 存储、配置脱敏和中英文 i18n key。

## 发布到 GitHub 前

建议公开上传这些内容：

- 源代码：`server.js`、`src/`、`public/`、`scripts/`、`test/`
- 项目文档：`README.md`、`README-zh.md`、`SECURITY.md`、`CONTRIBUTING.md`、`CHANGELOG.md`
- 配置模板：`.env.example`、`config.example.json`
- 依赖锁：`package.json`、`package-lock.json`
- 许可证：`LICENSE`

不要上传：

- `.env`
- `config.json`
- `node_modules/`
- `data/*.json`
- `data/logs/`
- 个人聊天记录、微信凭证、本地路径、token、账号信息

## 贡献

欢迎提交 issue、改进建议和 pull request。涉及用户界面或文档时，请保持中文和英文语义一致。

## License

MIT. See [LICENSE](LICENSE).
