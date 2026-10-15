# 🎓 AMU.ai — AI Student Assistant for Aligarh Muslim University

An AI-powered chatbot for AMU students. Ask about **notices, results, exam schedules, admissions, departments, courses, scholarships, hostels, and more** — all pulling from official AMU sources.

## ✨ Features

- **🤖 AI-Powered Chat** — Uses Google Gemini AI to understand natural language queries and give helpful, contextual answers
- **📋 Real AMU Data** — Fetches live notices, department info, CS resources, exam/admission notices from official AMU APIs
- **🎯 Rule-Based Fallback** — If no AI key is configured (or Gemini is down), a smart intent-detection engine answers from official sources
- **👤 Student Profile** — Set your enrollment number and department for personalized responses
- **🌙 Dark Mode** — Toggle between light and dark themes
- **📱 Mobile Responsive** — Works great on phones and tablets
- **⚡ Fast & Lightweight** — No database, no framework. Pure Node.js with in-memory caching (8 min TTL)
- **🛡️ Hardened API** — Rate limiting, request-size caps, input validation, security headers, path-traversal protection, `/health` endpoint

## 🚀 Quick Start

### Requirements

- Node.js **18+** (developed and tested on Node 24)

### 1. Clone & Install

```bash
git clone https://github.com/Aquib2004/amu-ai-assistant.git
cd amu-ai-assistant
npm install
```

### 2. (Optional) Add AI — Get a free Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API Key" — it's **free**
3. Copy the `.env.example` to `.env`:

```bash
cp .env.example .env
```

4. Edit `.env` and paste your key:

```env
GEMINI_API_KEY=your_key_here
PORT=4173
```

> **Without an API key**, AMU.ai still works using the smart rule-based fallback engine.

### 3. Start

```bash
npm start
```

### 4. Open

```
http://localhost:4173
```

## 🔌 API

All responses are JSON. The same server also serves the frontend from `public/`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness: status, version, AI-configured flag, uptime |
| `GET` | `/api/snapshot` | Aggregated snapshot: recent notices, departments, exam & admission notices |
| `GET` | `/api/notices/recent` | Recent AMU notices (optional `?search=` filter) |
| `GET` | `/api/notices/campus` | Campus notices (optional `?search=` filter) |
| `GET` | `/api/departments` | AMU departments list |
| `GET` | `/api/computer-science` | Computer Science hub (courses, notes, papers, notices) |
| `POST` | `/api/chat` | Chat with the assistant |

`POST /api/chat` request body:

```json
{
  "message": "How do I check my result?",
  "profile": { "enrollment": "GK1234", "department": "Computer Science" }
}
```

Limits: max 2000 characters per message; 30 chat requests/minute/IP by default (`RATE_LIMIT_MAX`); wrong HTTP methods on API routes return `405`.

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | No | *(none)* | Enables AI answers via Google Gemini. Falls back to rules without it |
| `PORT` | No | `4173` | HTTP port (Render injects this automatically) |
| `NODE_ENV` | No | *(unset)* | Set `production` to hide internal error details from API responses |
| `RATE_LIMIT_MAX` | No | `30` | Chat requests allowed per IP per minute |

## 📱 Usage

1. **Set your profile** — Enter enrollment number and department in the sidebar
2. **Ask anything** — Use the chat input or click suggestion chips:
   - "Show latest notices"
   - "How do I check my result?"
   - "Computer Science notes and study material"
   - "Show exam schedule"
   - "Tell me about departments at AMU"
   - "Scholarship and fee information"
   - "Hostel information"
   - "Contact details for AMU offices"

## 🏛️ Official Sources Used

| Source | URL |
|--------|-----|
| AMU Official Website | https://www.amu.ac.in/ |
| Recent Notices | https://www.amu.ac.in/recent-notices |
| Campus Notices | https://www.amu.ac.in/campus-notices |
| Admission Notices | https://amuonline.ac.in/notices?scope=admissions |
| Examination Notices | https://amuonline.ac.in/notices?scope=examinations |
| Result Portal | https://ccae.amucontrollerexams.com/result_display/loginmodalresultdisplaybyfacno.php |
| Exam Schedule | https://www.results.amucontrollerexams.com/display/scheme |
| Registration (OEPS) | https://oeps.amucoe.ac.in/ |
| Departments | https://www.amu.ac.in/departments |
| CS Department | https://www.amu.ac.in/department/computer-science |
| AMU API | https://api.amu.ac.in/api/v1 |

## 🧪 Test

```bash
npm test
```

Covers: intent detection, answer engine, profile sanitization, `/health`, static serving, path-traversal protection, request validation (`400`), wrong-method handling (`405`), rate limiting (`429`), and security headers. Some tests query live AMU sources and need internet access.

## 🚀 Deployment (free tier)

The app is a single Node process serving both API and frontend — one free web service is enough. There is **no database and no persistent storage**.

### Render (recommended)

1. Push this repository to GitHub
2. In Render: **New → Web → Connect this repo**
   - Build command: `npm install`
   - Start command: `npm start`
3. Set `NODE_ENV=production` (and optionally `GEMINI_API_KEY`) in the service environment
4. Use `/health` as the health-check path

> Render free web services **spin down after inactivity** (first request after idle can take ~50–60 s). This is a free-tier limitation, not an app bug.

### Alternatives

Any platform that runs a plain Node HTTP server works: Fly.io, Railway, a VPS. No build step is required.

## 🔧 Tech Stack

- **Backend:** Node.js 18+ (no web framework — built-in `http` module)
- **Frontend:** Vanilla HTML, CSS, JavaScript (no build step)
- **AI:** Google Gemini 2.0 Flash API (optional, free tier)
- **Data:** Official AMU public APIs and pages (cached in memory for 8 minutes)

## 📁 Project Structure

```
amu-ai-assistant/
├── server.js                  # HTTP server + AI + AMU data engine (single file)
├── package.json               # scripts: start / dev / test
├── .env.example               # environment template (copy to .env)
├── test.js                    # unit + HTTP integration tests
├── public/
│   ├── index.html             # chatbot UI
│   ├── styles.css             # responsive styles (light/dark)
│   └── app.js                 # frontend application
└── .github/workflows/ci.yml   # CI: syntax check + tests
```

## 🛠️ Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "⚠ Gemini AI: No API key" on startup | No `GEMINI_API_KEY` in `.env` | Optional — rule-based fallback still works |
| Notices show "Data unavailable" | No internet, or AMU sources down | App degrades gracefully; official links still shown |
| TLS errors in logs | Some AMU hosts have certificate issues | Server falls back automatically for **official AMU hosts only** |
| `429 Too many requests` | Chat rate limit exceeded | Wait one minute or raise `RATE_LIMIT_MAX` |
| Port already in use | Another process uses 4173 | Set `PORT` in `.env` |

## 📝 Notes & Limitations

- Uses **public official AMU sources** and links back to them
- Does **not** scrape or display private student marks — result queries route to the official AMU Controller portal
- AI answers can be wrong — always verify on official pages (the UI shows a disclaimer)
- Rate limiting and caching are in-memory: they reset on restart and are per-instance (fine for a single free-tier instance)

## 🔒 Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting. Never commit `.env` or API keys — `.env` is git-ignored.

## 📄 License

MIT — see [LICENSE](LICENSE).