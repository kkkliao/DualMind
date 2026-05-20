# Contributing to DualMind

Thanks for helping improve DualMind.

## Development

```bash
npm install
npm run verify
npm start
```

Keep changes small and focused. When UI copy changes, update both Chinese and English wording.

## Safety Rules

- Do not commit `.env`.
- Do not commit `data/*.json`.
- Do not add private user names, private local paths, or provider secrets to docs or fixtures.
- Keep remote code execution disabled by default.
- Mark experimental channel features, such as WeChat, clearly.

## Pull Requests

Before opening a PR:

- Run `npm run verify`.
- Check README.md and README-en.md stay semantically aligned.
- Explain behavior changes and any remaining limitations.
