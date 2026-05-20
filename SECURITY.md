# Security Policy

DualMind is local-first. Keep the server bound to `127.0.0.1` unless you understand the risk of exposing it.

## Sensitive Data

Do not publish:

- `.env`
- `data/*.json`
- provider tokens
- local private paths
- raw agent metadata that may include prompts or session details

## Execution Safety

DualMind separates conversation from execution:

- Daily chat can include both AIs.
- Coding or risky requests require an execution holder.
- Risky requests require user confirmation by default.
- Remote channel requests must not directly execute code.

## WeChat

WeChat integration is experimental. When configured:

- Use `wechat.token` to enable signature verification.
- Use `wechat.authorizedUsers` to restrict senders.
- Keep `safety.allowRemoteCodeExecution` disabled unless a future hardened release explicitly supports it.

## Reporting

Open a private issue or contact the maintainer if you find a vulnerability. Do not include secrets or private logs in public reports.
