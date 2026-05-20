# DualMind Handover

> Project path: `dualmind/`  
> Updated: 2026-05-18  
> Goal: make DualMind a GitHub-ready local group chat for the user, OpenClaw, and Hermes.

DualMind is a local group collaboration interface. It connects to OpenClaw and Hermes as agent systems. It does not configure or assume the underlying model/provider. OpenClaw and Hermes may use any provider configured inside their own runtimes.

## Product Positioning

DualMind should feel like a real three-person group:

- User: the person using the app.
- OpenClaw: one AI group member.
- Hermes: one AI group member.
- Coordinator: invisible server-side orchestration that manages routing, role mode, execution lock, and safety policy.

Daily conversation should not make the second AI silent. Both AIs can speak naturally when they add value. Execution tasks are different: when files, commands, configuration, or other side effects are involved, only the current executor may claim execution. The other AI stays visible as reviewer/calibrator in the group chat.

Do not write product copy that says the project is for a named private person. Use `用户 / user`.

## Agent Boundary

DualMind integrates:

- OpenClaw system, via `openclaw` CLI or OpenClaw Gateway.
- Hermes system, via `hermes` CLI.

DualMind must not hard-code:

- DeepSeek
- MiniMax
- OpenAI
- Anthropic
- any other provider

Provider names may appear only as examples in documentation, with clear wording that they are configured outside DualMind.

## Role Modes

Role modes are runtime configuration, not permanent identity.

| Mode | Executor | Reviewer | Behavior |
| --- | --- | --- | --- |
| `openclaw-main` | OpenClaw | Hermes | OpenClaw can execute; Hermes reviews/calibrates publicly. |
| `hermes-main` | Hermes | OpenClaw | Hermes can execute; OpenClaw reviews/calibrates publicly. |
| `free-chat` | none by default | none | Both AIs can talk; code execution should ask for an executor. |
| `debate` | none by default | none | Both AIs debate longer before converging. |
| `mention-only` | explicitly mentioned AI for that turn | optional | Mentions override routing. |

OpenClaw and Hermes must never be described as permanently main/sub. The user can swap roles.

## Execution Safety

Current implementation uses a server-side execution lock for coding/risky intents:

- One turn can have one executor.
- If another coding/risky turn starts while the lock is held, the server returns a busy message.
- The reviewer can advise, question, request changes, or veto unsafe steps.
- The reviewer must not claim to edit files or run commands.
- Free-chat and debate modes do not grant execution permission unless a user explicitly mentions an agent or switches role mode.

The lock is currently a process-memory lock. A future production release should persist lock state or bind it to task records if multi-process deployment is needed.

## Conversation Policy

Daily chat:

- Both AIs can speak.
- The second reply should add a new angle, caveat, correction, or natural conversational response.
- Avoid repeated paraphrase.

Code/task chat:

- Executor states plan and action boundary.
- Reviewer responds in public group-chat language.
- No hidden protocol tags should appear in chat.
- Risky operations should require user confirmation.

Debate:

- `config.json > collaboration.architectureDebateMessageBudget` controls debate length.
- Default target is longer than a two-message exchange.
- Final debate message should converge on decision points, remaining risks, and who should execute if needed.

## Important Files

```text
server.js                         Express API, SSE, coordinator logic
src/agents/openclaw-adapter.js    OpenClaw CLI/Gateway adapter
src/agents/hermes-adapter.js      Hermes CLI adapter
src/coordinator/roles.js          role-mode normalization and routing
src/coordinator/execution-lock.js execution lock manager
src/store/turn-store.js           structured turn records
src/utils/cli.js                  safe spawn wrapper and output parsing
public/index.html                 main UI
public/setup.html                 first-time setup wizard
public/app.js                     chat client and settings behavior
public/style.css                  app styling, including turns panel layout
test/                             node:test coverage for coordinator and parser behavior
config.json                       local runtime configuration
oc-prompt.txt                     OpenClaw persona seed
hermes-prompt.txt                 Hermes persona seed
README.md                         Chinese GitHub README
README-en.md                      English GitHub README
```

## Runtime Configuration

`config.json` is the main local config:

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 3000
  },
  "openclaw": {
    "binPath": "",
    "gatewayUrl": "http://127.0.0.1:18789",
    "mode": "infer",
    "agentId": "main",
    "sessionId": "dualmind-openclaw"
  },
  "hermes": {
    "binPath": "",
    "sessionId": "dualmind-hermes"
  },
  "roleMode": "openclaw-main"
}
```

If `binPath` is empty, DualMind tries PATH and common install locations. `.env` can override CLI paths with `OPENCLAW_BIN` and `HERMES_BIN`.

## Output Parsing Rule

Agent adapters should extract visible assistant text only. They must not stream raw JSON metadata to the UI.

The parser currently supports common shapes including:

- `outputs[0].text`
- `result.payloads[0].text`
- `result.finalAssistantVisibleText`
- `finalAssistantVisibleText`
- `choices[0].message.content`

If a CLI returns JSON but no known text field is found, return an empty response or error rather than dumping raw JSON.

## Open Source Readiness

Before publishing to GitHub:

- Keep `.env` out of git.
- Keep `data/*.json` out of git because logs may contain private user text, local paths, provider metadata, tokens, or prompts.
- Keep Chinese and English README semantically aligned.
- Make the setup wizard usable for generic users.
- Avoid private paths and private names in docs.
- Mark WeChat integration as experimental unless fully hardened.

## Verification Commands

```bash
npm install
node --check server.js
node --check public/app.js
node --check src/utils/cli.js src/agents/openclaw-adapter.js src/agents/hermes-adapter.js src/coordinator/roles.js
npm test
npm start
curl http://127.0.0.1:3000/api/status
curl http://127.0.0.1:3000/api/setup/detect
```

Manual UI checks:

- Open `http://127.0.0.1:3000`
- Open `http://127.0.0.1:3000/setup`
- Save OpenClaw/Hermes CLI paths.
- Switch role modes.
- Test `@OpenClaw` and `@Hermes`.
- Test no-mention daily chat.
- Test debate mode.

## Known Follow-ups

- Add full UI i18n dictionaries instead of mixed bilingual labels.
- Add persistent task records for long-running execution.
- Add UI for inspecting `/api/turns` records and replaying a specific turn context.
- Add replay/retry controls on top of the turns panel.
- Add optional Gateway-first OpenClaw transport when Gateway APIs are stable.
- Add authenticated remote message handling before exposing WeChat/webhook routes outside localhost.
- Expand tests for route rendering and UI language persistence.
