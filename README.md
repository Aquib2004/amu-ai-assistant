# 🎓 AMU.ai v2.0 — AI Student Assistant for Aligarh Muslim University

An AI-powered chatbot for AMU students. Ask about **notices, results, exam schedules, admissions, departments, courses, scholarships, hostels, and more** — all pulling from official AMU sources.

## ✨ Features

- **🤖 AI-Powered Chat** — Uses Google Gemini AI to understand natural language queries and give helpful, contextual answers
- **📋 Real AMU Data** — Fetches live notices, department info, CS resources, exam/admission notices from official AMU APIs
- **🎯 Intent Detection Fallback** — If no AI key configured, a smart rule-based engine handles all AMU queries
- **👤 Student Profile** — Set your enrollment number and department for personalized responses
- **🌙 Dark Mode** — Toggle between light and dark themes
- **📱 Mobile Responsive** — Works great on phones and tablets
- **⚡ Fast & Lightweight** — No databases, no frameworks. Pure Node.js with caching

## 🚀 Quick Start

### 1. Clone & Install

```bash
cd amu.ai
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

## 📁 Project Structure

```
amu.ai/
├── server.js              # HTTP server + AI + AMU data engine
├── package.json
├── .env.example           # Environment config template
├── .gitignore
├── test.js                # Tests
├── public/
│   ├── index.html         # Chatbot UI
│   ├── styles.css         # Modern responsive styles (dark mode)
│   └── app.js             # Frontend application
└── README.md
```

## 🔧 Tech Stack

- **Backend:** Node.js (no frameworks)
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **AI:** Google Gemini 2.0 Flash API (free tier)
- **Data:** AMU official REST APIs

## 📝 Notes

- This tool uses **public official AMU sources** and links back to them
- Does **not** scrape or display private student marks
- Result queries route students to the official AMU Controller result portal
- AI responses are enhanced with real-time AMU data as context