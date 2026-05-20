# Changelog

## 2.1.0 - 2026-05-19

- Added reliable turn statuses: `done`, `partial`, `error`, `needs-confirmation`, `cancelled`, and `rejected`.
- Fixed risky-action confirmation so execution locks are not acquired before confirmation.
- Replaced `mention-only` with `mention-first` while keeping legacy config compatibility.
- Added structured WeChat pairing responses with `qrUrl` and `pairingUrl`; invalid fallback text is no longer used as a link.
- Added WeChat webhook safety boundaries for disabled state, optional signature verification, authorized users, and remote risky/coding requests.
- Added agent health endpoint and Settings buttons for real OpenClaw/Hermes reply tests.
- Persisted reply-test health results in local ignored data so recovered agent status survives server restarts.
- Added simulated streaming capability markers and CLI incremental output callbacks.
- Added turn retry, copy-user-message, and cancel controls.
- Added queued WeChat turn records for remote messages with source and sender metadata.
- Added queued remote-message continuation from the Web UI.
- Added Action Lease metadata with owner, scope, expiry, and release status.
- Added policy-warning detection when a non-executor claims code or command execution.
- Added per-agent turn states for `thinking`, `streaming`, `done`, and `error`.
- Added Markdown turn replay/export.
- Added shared `public/i18n/zh.json` and `public/i18n/en.json` dictionaries plus `npm run i18n:check`.
- Added streaming modules for SSE writing and simulated progressive output.
- Added config-store redaction tests for public configuration.
- Added WeChat channel module tests for signature validation, XML parsing, pairing URL normalization, and queued turn creation.
- Added remote safety policy tests for Web UI confirmation of remote coding/risky messages.
- Added adapter capability contract so true streaming is only advertised explicitly.
- Improved thinking-state behavior with a minimum visible duration and persistent error state.
- Improved sidebar health labels using latest real reply results.
- Removed personal support/QR content from the default open-source UI.
- Added setup support for manual OpenClaw CLI path entry.
- Updated Chinese and English README content to describe current capabilities accurately.
- Added `npm run check` and `npm run verify`.
