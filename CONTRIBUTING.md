# Contributing

Thanks for helping improve AMU.ai!

## Workflow

1. Fork the repository and create a feature branch from `main`
2. Make focused, small changes
3. Add or update tests in `test.js` for behavior changes
4. Run the checks locally:

```bash
npm ci
node --check server.js
npm test
```

5. Open a pull request with a clear description of the change

## Guidelines

- Keep the project dependency-light: it intentionally uses only Node.js built-ins plus `dotenv` (and optionally `@google/generative-ai`)
- Do not commit secrets, `.env` files, or personal scratch files
- Match the existing code style (plain CommonJS, no build step)
- AI-generated content must never be presented as verified official information

## Reporting Bugs

Use GitHub Issues. For security issues, see [SECURITY.md](SECURITY.md).
