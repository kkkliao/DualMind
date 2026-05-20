# DualMind

[简体中文](README.md) | English

DualMind is a local dual-AI group collaboration platform that places the user, OpenClaw, and Hermes into one auditable three-person chat. In everyday conversation, both AIs can speak, correct, and complement each other naturally. For tasks that modify code, run commands, write files, or change configuration, only the current main AI may execute, while the supporting AI reviews, calibrates, debates, and suggests improvements so two agents do not fight over the same action.

Compared with relying on a single model or a single agent, DualMind lets two independent AIs cross-check the same problem, add missing context, and debate before the answer is finalized. One AI can propose a plan while the other catches omissions, factual mistakes, role-boundary issues, or execution risks; the current main AI then converges the discussion into an actionable result. This collaboration pattern helps reduce hallucinations and simple mistakes while improving judgment quality, code reliability, and execution safety on complex tasks.

DualMind connects to OpenClaw and Hermes as agent systems. It does not lock you into any specific model or provider. OpenClaw and Hermes may use DeepSeek, MiniMax, OpenAI, Anthropic, OpenRouter, or another backend; model configuration stays inside OpenClaw and Hermes.

> The current version is best treated as a local macOS preview or small-scope alpha. Windows support, direct two-AI WeChat replies, and true token-level streaming are still being refined.

## Why It Matters

- **A real group-chat workflow**: the user, OpenClaw, and Hermes share one conversation instead of a simple split view or serial chain.
- **Dual-AI cross-review**: two agents can complement, challenge, and correct each other, making hallucinations, omissions, and weak plans easier to catch than with a single-model answer.
- **No execution fights**: only two role modes exist: OpenClaw main / Hermes supporting, or Hermes main / OpenClaw supporting. The main AI executes; the supporting AI reviews.
- **Mentions do not steal ownership**: `@OpenClaw` / `@Hermes` only changes who replies first, not who owns execution.
- **Natural daily conversation**: the supporting AI is not silent during ordinary chat; both AIs can add context, correct mistakes, and acknowledge fixes.
- **Execution-review closure**: after the supporting AI raises risks or improvements, the main AI must publicly respond by applying, asking the user to confirm, or explaining why not.
- **Remote channels are safety-first**: WeChat messages can enter DualMind turn records; remote code/command requests are not executed directly by default.
- **Chinese and English UI**: the main chat, Settings, setup wizard, docs, and role-mode labels are localized.

## Core Features

- Local web group chat
- First-time setup wizard
- OpenClaw / Hermes path detection and real reply tests
- Two main/supporting role modes
- Action Lease execution control
- Read-only review path for the supporting AI
- Daily correction and acknowledgment closure
- Main-AI follow-up closure for execution tasks
- SSE thinking animation and simulated progressive output
- Local chat history and structured turn records
- Turns panel: retry, cancel, export, continue remote messages
- Optional WeChat integration entry point
- macOS background service helper
- Automated tests and i18n key checks

## Requirements

- Node.js 22+
- npm
- OpenClaw CLI
- Hermes CLI

The official WeChat plugin also requires Node.js 22+. Model/provider setup is not handled by DualMind; configure models in OpenClaw and Hermes first.

## Quick Start

```bash
git clone <your-repo-url>
cd dualmind
npm install
cp .env.example .env
npm start
```

Open:

```text
http://127.0.0.1:3000
```

On first run, or whenever `config.json` is incomplete, the home page redirects to the setup wizard:

```text
http://127.0.0.1:3000/setup
```

The wizard detects OpenClaw / Hermes paths, the OpenClaw Gateway URL, role mode, and safety preferences. After setup, the server writes a local private `config.json`. Public repositories should commit `config.example.json`, not a personal `config.json`.

## Role Modes

DualMind has exactly two role modes:

| Mode | Executor | Reviewer |
| --- | --- | --- |
| `openclaw-main` | OpenClaw | Hermes |
| `hermes-main` | Hermes | OpenClaw |

In everyday chat, OpenClaw and Hermes are both group members and may both speak. Mentions only decide speaking order:

```text
@Hermes review this from a safety angle first
@OpenClaw start with an execution plan
Can both of you debate the upgrade order?
```

When a request involves writing files, running commands, changing configuration, or generating a project, the current main AI is the only executor. The supporting AI can communicate, calibrate, debate, review, and flag risks publicly, but it must not claim that it executed anything or promise to act later after getting execution permission.

## How It Works

DualMind is organized around these modules:

- `server.js`: Express service, configuration, SSE output, and API routes.
- `public/`: chat page, Settings, setup wizard, docs, and i18n copy.
- `src/agents/`: OpenClaw / Hermes adapters.
- `src/coordinator/`: roles, intent detection, execution control, policy warnings, and remote safety policy.
- `src/store/`: local config, turn, and task storage.
- `src/streaming/`: SSE writer and simulated progressive output.
- `test/`: automated tests.

Turn statuses:

| Status | Meaning |
| --- | --- |
| `done` | All required agent replies succeeded |
| `partial` | At least one agent succeeded and at least one agent failed |
| `error` | No agent successfully replied |
| `needs-confirmation` | A risky action was detected and needs user confirmation |
| `queued` | A remote-channel message entered DualMind and is waiting for the user to continue in the Web UI |
| `cancelled` | The user cancelled a running or confirmation-pending turn |
| `rejected` | The Action Lease or safety policy rejected the turn |

## Configuration

Main configuration lives in the local private `config.json`; the repository provides `config.example.json` as a template:

```json
{
  "setup": {
    "completed": true,
    "language": "en"
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

Environment variables are documented in `.env.example`:

```bash
DUALMIND_HOST=127.0.0.1
DUALMIND_PORT=3000
OPENCLAW_BIN=
HERMES_BIN=
```

`openclaw.mode` defaults to `agent`, allowing OpenClaw to handle code, command, and file tasks when it is the current main AI. If switched to `infer`, OpenClaw is treated as read-only chat/planning; execution requests are blocked until it returns to `agent` or Hermes is selected as main.

## Background Service

The browser is only the DualMind console. WeChat webhooks, remote-message queueing, turn writes, and agent calls are handled by the backend service. The browser tab may be closed, but the backend must keep running.

For development:

```bash
npm start
```

Keep it running after login on macOS:

```bash
npm run service:install
npm run service:status
```

Common commands:

```bash
npm run service:start
npm run service:stop
npm run service:restart
npm run service:uninstall
```

The service file is written to `~/Library/LaunchAgents/local.dualmind.server.plist`, and logs are stored under `data/logs/`.

## WeChat Integration

DualMind includes Tencent's official OpenClaw WeChat plugin and installer as project dependencies:

- `@tencent-weixin/openclaw-weixin`
- `@tencent-weixin/openclaw-weixin-cli`
- `qrcode`

Users do not need to manually copy `npx -y @tencent-weixin/openclaw-weixin-cli@latest install`. The Settings button for installing/repairing the official WeChat plugin calls the bundled installer from project dependencies. The "Get QR code" button calls the official plugin login flow, receives a real WeChat scan link, and renders it as a QR code.

Current boundaries:

- One local DualMind device keeps one current WeChat account.
- The official scan flow first connects to the OpenClaw Gateway `openclaw-weixin` channel.
- DualMind's built-in `/api/wechat` webhook is currently the safe queue path: remote messages enter turn records and the user continues from the Web UI.
- Direct two-AI automatic replies in WeChat, with prefixes such as `OpenClaw:` / `Hermes:`, require a future DualMind WeChat bridge layer.
- Remote coding/risky requests do not directly run code or commands.

## Security And Privacy

Keeping the service bound to `127.0.0.1` is recommended.

Principles:

- Conversation is free; execution is locked.
- Only the current main AI may claim code, command, or file execution.
- The supporting AI can suggest, review, request changes, or block risk.
- Risky actions require user confirmation.
- Remote messages do not directly trigger code edits by default.
- Local chats, turns, tasks, health checks, and logs should not be committed to public repositories.

The default `.gitignore` excludes:

- `.env`
- `config.json`
- `node_modules/`
- `data/*.json`
- `data/logs/`
- local logs, caches, and OS files

## Platform Status

| Platform | Status |
| --- | --- |
| macOS | Main path is wired: web service, setup wizard, Settings, OpenClaw/Hermes detection, background service, and WeChat plugin entry |
| Windows | Node/Express and frontend should be portable in principle, but background service setup, path detection, and WeChat install/login flow still need dedicated verification |
| Linux | Not specifically verified; the Node service should be portable, but service scripts and agent path detection need work |

The first GitHub release should be labeled `alpha` or `preview`. Mark it stable after Windows/Linux service options, the WeChat bridge, screenshots, and a clean-machine install test are complete.

## Development And Verification

```bash
npm run dev
npm run verify
```

Individual checks:

```bash
npm run check
npm test
npm run i18n:check
```

Current tests cover role modes, mention-first speaking, Action Lease execution control, execution-review closure, supporting-AI read-only review, policy warnings, remote safety policy, WeChat channel behavior, adapter capability contracts, JSON output extraction, SSE, turn/task storage, config redaction, and Chinese/English i18n keys.

## Before Publishing To GitHub

Recommended to publish:

- Source code: `server.js`, `src/`, `public/`, `scripts/`, `test/`
- Project docs: `README.md`, `README-en.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
- Config templates: `.env.example`, `config.example.json`
- Dependency lockfile: `package.json`, `package-lock.json`
- License: `LICENSE`

Do not publish:

- `.env`
- `config.json`
- `node_modules/`
- `data/*.json`
- `data/logs/`
- personal chat logs, WeChat credentials, local paths, tokens, account data

## Contributing

Issues, suggestions, and pull requests are welcome. For UI or docs changes, keep the Chinese and English versions semantically aligned.

## License

MIT. See [LICENSE](LICENSE).
