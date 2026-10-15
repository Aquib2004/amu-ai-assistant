# Security Policy

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report them privately via GitHub Security Advisories
(https://github.com/Aquib2004/amu-ai-assistant/security/advisories/new) or
contact the maintainer directly through GitHub
(https://github.com/Aquib2004).

You should receive a response within a few days. Please include:

- A description of the vulnerability
- Steps to reproduce it
- The potential impact

## Supported Versions

Only the latest version on `main` is supported.

## Configuration Rules

- Never commit real API keys or tokens. `.env` is git-ignored — use `.env.example` as the template.
- If a secret is ever exposed, rotate it immediately at the provider (GitHub, Google AI Studio, etc.).
- Production deployments should set `NODE_ENV=production` so internal error details are not returned by the API.

## Known Scope

- This app talks only to **public** AMU sources; it stores no user data server-side
  (the student profile lives in the browser's localStorage).
- Rate limiting and caching are in-memory and per-instance; they are not a
  substitute for an upstream WAF on high-traffic deployments.
