/* =============================================
   AMU.ai — AI-Powered Chatbot Server
   Aligarh Muslim University Student Assistant
   ============================================= */

const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { URL } = require("node:url");

// Load .env if available
try {
  require("dotenv").config();
} catch {
  // dotenv not available, continue with process.env
}

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const AMU_API = "https://api.amu.ac.in/api/v1";
const AMU_STORAGE = "https://api.amu.ac.in/storage";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const { version: PACKAGE_VERSION } = require("./package.json");

// ==================== RELIABILITY SETTINGS ====================
// Upstream AMU pages/JSON are cached in-memory by getJson()/getText() (8 min TTL).
// Simple in-memory rate limit for POST /api/chat (per client IP).
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 30);
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_MESSAGE_LENGTH = 2000;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};

const rateBuckets = new Map(); // ip -> { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (rateBuckets.size > 10_000) {
    for (const [key, value] of rateBuckets) {
      if (now >= value.resetAt) rateBuckets.delete(key);
    }
  }
  return bucket.count <= RATE_LIMIT_MAX;
}

// ============================================================
// OFFICIAL AMU SOURCE LINKS
// ============================================================
const sourceLinks = {
  officialHome: "https://www.amu.ac.in/",
  recentNotices: "https://www.amu.ac.in/recent-notices",
  campusNotices: "https://www.amu.ac.in/campus-notices",
  admissionNotices: "https://amuonline.ac.in/notices?scope=admissions",
  examinationNotices: "https://amuonline.ac.in/notices?scope=examinations",
  resultPortal: "https://ccae.amucontrollerexams.com/result_display/loginmodalresultdisplaybyfacno.php",
  examSchedule: "https://www.results.amucontrollerexams.com/display/scheme",
  registration: "https://oeps.amucoe.ac.in/",
  departments: "https://www.amu.ac.in/departments"
};

const computerScience = {
  title: "Department of Computer Science",
  slug: "computer-science",
  id: 3,
  officialUrl: "https://www.amu.ac.in/department/computer-science",
  paths: {
    detail: "department/computer-science",
    about: "department/computer-science/about-the-department",
    notices: "department/computer-science/notice-and-circular",
    usefulDownloads: "department/computer-science/useful-download",
    previousYearPapers: "department/computer-science/previous-year-papers",
    attendance: "department/computer-science/student-attendance-record",
    phd: "department/computer-science/phd",
    postgraduate: "department/computer-science/post-graduate",
    undergraduate: "department/computer-science/under-graduate"
  }
};

// ============================================================
// STATIC KNOWLEDGE BASE
// ============================================================
const staticKnowledge = [
  {
    id: "results",
    title: "Examination Results",
    category: "Examinations",
    summary: "AMU Online links current students to the Controller of Examinations result display. Students need their enrollment/faculty number on the official result portal at " + sourceLinks.resultPortal,
    url: sourceLinks.resultPortal,
    keywords: ["result", "marks", "grade", "semester result", "enrollment", "faculty number", "pass", "fail"]
  },
  {
    id: "schedule",
    title: "Examination Schedule",
    category: "Examinations",
    summary: "The AMU Online current-student section points students to the official examination schedule display at " + sourceLinks.examSchedule,
    url: sourceLinks.examSchedule,
    keywords: ["exam schedule", "date sheet", "timetable", "time table", "scheme", "exam date"]
  },
  {
    id: "registration",
    title: "Registration cum Examination",
    category: "Examinations",
    summary: "Registration and examination-form related work is handled through AMU's official online examination processing system at " + sourceLinks.registration,
    url: sourceLinks.registration,
    keywords: ["registration", "exam form", "continuation", "readmission", "re admission", "oeps"]
  },
  {
    id: "admission-notices",
    title: "Admission Notices",
    category: "Admissions",
    summary: "AMU Online publishes admission notices, admit-card updates, and admission-guide announcements for applicants at " + sourceLinks.admissionNotices,
    url: sourceLinks.admissionNotices,
    keywords: ["admission", "admit card", "entrance", "guide", "application", "neet"]
  },
  {
    id: "examination-notices",
    title: "Examination Notices",
    category: "Examinations",
    summary: "AMU Online publishes examination notices such as hall-ticket, re-evaluation, registration, and result-related notices at " + sourceLinks.examinationNotices,
    url: sourceLinks.examinationNotices,
    keywords: ["exam notice", "re-evaluation", "reevaluation", "hall ticket", "examination notice"]
  },
  {
    id: "recent-notices",
    title: "Recent University Notices",
    category: "Notices",
    summary: "The official AMU website publishes recent university notices with downloadable circulars and PDFs at " + sourceLinks.recentNotices,
    url: sourceLinks.recentNotices,
    keywords: ["notice", "notices", "circular", "latest", "recent", "pdf"]
  },
  {
    id: "campus-notices",
    title: "Campus Notices",
    category: "Notices",
    summary: "AMU has a separate official campus notices section for university-wide campus circulars at " + sourceLinks.campusNotices,
    url: sourceLinks.campusNotices,
    keywords: ["campus", "electricity", "shutdown", "campus notice", "campus circular"]
  },
  {
    id: "departments",
    title: "Departments",
    category: "Academics",
    summary: "The official AMU site exposes a department list and department pages such as Computer Science, Economics, English, Law, Engineering departments, Medical departments, and more at " + sourceLinks.departments,
    url: sourceLinks.departments,
    keywords: ["department", "dept", "faculty", "chairman", "courses", "syllabus"]
  },
  {
    id: "scholarships",
    title: "Scholarship and Student Help",
    category: "Student Services",
    summary: "Scholarship and student-services notices can appear in AMU recent notices or department/office notice pages. Check at " + sourceLinks.recentNotices,
    url: sourceLinks.recentNotices,
    keywords: ["scholarship", "fee", "refund", "student section", "financial", "stipend"]
  },
  {
    id: "hostel",
    title: "Hostel Information",
    category: "Student Services",
    summary: "Hostel and hall updates are usually published as AMU notices or by the relevant hall/office. Check recent notices at " + sourceLinks.recentNotices,
    url: sourceLinks.recentNotices,
    keywords: ["hostel", "hall", "residence", "provost", "room", "accommodation"]
  },
  {
    id: "contact",
    title: "Contact Information",
    category: "Student Services",
    summary: "For official contact details, use the AMU website at " + sourceLinks.officialHome + " or check the relevant department page at " + sourceLinks.departments,
    url: sourceLinks.officialHome,
    keywords: ["contact", "phone", "email", "office", "help", "phone number"]
  }
];

// ============================================================
// CACHE & UTILITIES
// ============================================================
const cache = new Map();
const execFileAsync = promisify(execFile);
const officialTlsFallbackHosts = new Set(["api.amu.ac.in"]);

function cacheKey(url) { return url.toString(); }

async function getJson(url, ttlMs = 1000 * 60 * 8) {
  const key = cacheKey(url);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.timestamp < ttlMs) return hit.value;
  const value = await fetchJson(url);
  cache.set(key, { timestamp: Date.now(), value });
  return value;
}

async function getText(url, ttlMs = 1000 * 60 * 8) {
  const key = cacheKey(url);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.timestamp < ttlMs) return hit.value;
  const value = await fetchText(url);
  cache.set(key, { timestamp: Date.now(), value });
  return value;
}

async function fetchJson(url) {
  const text = await fetchText(url, "application/json,text/plain,*/*");
  return JSON.parse(text);
}

async function fetchText(url, accept = "text/html,*/*") {
  try {
    const response = await fetch(url, {
      headers: {
        accept,
        "user-agent": "AMU.ai student assistant (amu-ai/2.0)"
      },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`Official source returned ${response.status}`);
    return await response.text();
  } catch (error) {
    if (!canUseOfficialTlsFallback(url, error)) throw error;
    try {
      return await requestText(url, accept, true);
    } catch {
      if (process.platform !== "win32") throw error; // PowerShell fallback is Windows-only
      return await requestTextWithPowerShell(url);
    }
  }
}

function canUseOfficialTlsFallback(url, error) {
  const target = new URL(url);
  const code = error?.cause?.code || error?.code || "";
  return (
    officialTlsFallbackHosts.has(target.hostname) &&
    (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "UND_ERR_CONNECT_TIMEOUT" || error?.name === "TypeError")
  );
}

function requestText(url, accept, allowInvalidCertificate = false, redirects = 0, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === "https:" ? https : http;
    const options = {
      method: "GET",
      timeout: timeoutMs,
      headers: { accept, "user-agent": "AMU.ai student assistant (amu-ai/2.0)" }
    };
    if (target.protocol === "https:" && allowInvalidCertificate) options.rejectUnauthorized = false;
    const req = client.request(target, options, (res) => {
      const location = res.headers.location;
      if (location && res.statusCode >= 300 && res.statusCode < 400 && redirects < 3) {
        res.resume();
        resolve(requestText(new URL(location, target).toString(), accept, allowInvalidCertificate, redirects + 1));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Official source returned ${res.statusCode}`));
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Official source request timed out")));
    req.end();
  });
}

async function requestTextWithPowerShell(url) {
  const target = new URL(url);
  if (!officialTlsFallbackHosts.has(target.hostname)) {
    throw new Error("PowerShell fallback is limited to official AMU API hosts.");
  }
  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-Command", "$ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -Uri $env:AMU_AI_FETCH_URL -UseBasicParsing -TimeoutSec 45).Content"],
    { env: { ...process.env, AMU_AI_FETCH_URL: url }, maxBuffer: 30 * 1024 * 1024 }
  );
  return stdout;
}

function htmlDecode(input = "") {
  return input.replace(/&/g, "&").replace(/"/g, '"').replace(/&#039;/g, "'")
    .replace(/'/g, "'").replace(/&ndash;/g, "-").replace(/&mdash;/g, "-")
    .replace(/&nbsp;/g, " ").replace(/</g, "<").replace(/>/g, ">");
}

function stripTags(input = "") {
  return htmlDecode(input.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeText(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asOfficialFileUrl(file) {
  if (!file) return null;
  if (/^https?:\/\//i.test(file)) return file;
  return `${AMU_STORAGE}${file.startsWith("/") ? file : `/${file}`}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

// ============================================================
// AMU DATA FETCHERS
// ============================================================
async function fetchRecentNotices(search = "") {
  const params = new URLSearchParams({ lang: "en" });
  if (search) params.set("search", search);
  const json = await getJson(`${AMU_API}/recent-notice?${params.toString()}`);
  return (json.data?.data || []).slice(0, 20).map((item) => ({
    id: `amu-recent-${item.id}`,
    title: item.title,
    category: "Recent Notice",
    date: formatDate(item.created_at),
    url: asOfficialFileUrl(item.file) || sourceLinks.recentNotices,
    source: "AMU official recent notices"
  }));
}

async function fetchCampusNotices(search = "") {
  const params = new URLSearchParams({ lang: "en" });
  if (search) params.set("search", search);
  const json = await getJson(`${AMU_API}/campus-notice?${params.toString()}`);
  return (json.data?.data || []).slice(0, 20).map((item) => ({
    id: `amu-campus-${item.id}`,
    title: item.title,
    category: "Campus Notice",
    date: formatDate(item.created_at),
    url: asOfficialFileUrl(item.file) || sourceLinks.campusNotices,
    source: "AMU official campus notices"
  }));
}

async function fetchDepartments() {
  const json = await getJson(`${AMU_API}/department-list?lang=en`, 1000 * 60 * 60);
  return (json.data || []).map((item) => ({
    id: `dept-${item.id}`,
    title: item.title,
    slug: item.slug,
    url: `https://www.amu.ac.in/department/${item.slug}`
  }));
}

async function fetchDepartmentDetail(slug) {
  const params = new URLSearchParams({ lang: "en", slug });
  const json = await getJson(`${AMU_API}/department-detail?${params.toString()}`, 1000 * 60 * 30);
  return json.data || {};
}

async function fetchDepartmentSection(sectionPath, page = 1) {
  const params = new URLSearchParams({ lang: "en", slug: sectionPath });
  if (page > 1) params.set("page", String(page));
  const json = await getJson(`${AMU_API}/department-list-data?${params.toString()}`, 1000 * 60 * 15);
  return normalizeDepartmentSection(json.data || {}, sectionPath);
}

function normalizeDepartmentSection(payload, sectionPath) {
  const nestedPagination = payload.data && !Array.isArray(payload.data) && Array.isArray(payload.data.data);
  const directList = Array.isArray(payload.data);
  const singleItem = payload.data && !Array.isArray(payload.data) && !Array.isArray(payload.data.data);
  const items = nestedPagination ? payload.data.data : directList ? payload.data : singleItem ? [payload.data] : [];
  const meta = nestedPagination ? payload.data : payload;
  return {
    path: sectionPath, seoTitle: payload.seo_title || "", lastUpdate: payload.last_update || meta.last_update || "",
    currentPage: Number(meta.current_page || 1), lastPage: Number(meta.last_page || 1),
    perPage: Number(meta.per_page || items.length || 0), total: Number(meta.total || items.length || 0), items
  };
}

async function fetchAllDepartmentSection(sectionPath, maxPages = 20) {
  const first = await fetchDepartmentSection(sectionPath, 1);
  const pages = Math.min(first.lastPage || 1, maxPages);
  if (pages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => fetchDepartmentSection(sectionPath, i + 2).catch(() => null))
  );
  const items = [first.items, ...rest.filter(Boolean).map((p) => p.items)].flat();
  return { ...first, items, fetchedPages: pages };
}

function normalizeDepartmentFile(item, section, fallbackPath) {
  const title = item.title || item.link || item.name || "AMU department item";
  return {
    id: `${section}-${item.id || normalizeText(title)}`,
    title: stripTags(title),
    category: section,
    date: formatDate(item.created_at || item.updated_at || item.to_date),
    updatedAt: formatDate(item.updated_at),
    url: asOfficialFileUrl(item.file) || `${computerScience.officialUrl}/${fallbackPath.split("/").pop()}`,
    source: "AMU Computer Science"
  };
}

function extractLinksFromHtml(html = "") {
  const links = [];
  const regex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    links.push({ title: stripTags(match[2] || "Download"), url: match[1].startsWith("http") ? match[1] : asOfficialFileUrl(match[1]) });
  }
  return links;
}

function summarizeHtml(html = "", maxLength = 180) {
  const text = stripTags(html).replace(/\bCmputer\b/g, "Computer");
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function normalizeCourse(course, level, officialPath) {
  return {
    id: `cs-course-${course.id || normalizeText(course.name)}`,
    level,
    name: stripTags(course.name || "Computer Science course"),
    seats: stripTags(course.nos || "See official page"),
    admission: summarizeHtml(course.dr || course.cr || "Refer official AMU ordinances."),
    courseRequirements: summarizeHtml(course.cr || "Refer official AMU ordinances."),
    specialization: summarizeHtml(course.spec || "Computer Science"),
    accredited: course.acrr || "",
    careerPaths: summarizeHtml(course.jp || ""),
    objectives: summarizeHtml(course.peo || "", 260),
    outcomes: summarizeHtml(course.po || "", 260),
    subjectArea: summarizeHtml(course.spec || course.name || "Computer Science"),
    url: `${computerScience.officialUrl}/${officialPath.split("/").pop()}`
  };
}

function extractSubjectCode(text = "") {
  const matches = text.match(/\b[A-Z]{2,}[A-Z0-9-]*\d+[A-Z0-9-]*\b/g) || [];
  return matches.slice(0, 4);
}

function buildSubjectIndex(items) {
  const map = new Map();
  items.forEach((item) => {
    const title = item.title || item.name || "";
    extractSubjectCode(title).forEach((code) => {
      if (!map.has(code)) map.set(code, { code, title, count: 0, url: item.url });
      map.get(code).count += 1;
    });
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

async function fetchComputerScienceHub() {
  const [detail, aboutSection, notices, downloads, papers, attendance, phd, pg, ug] = await Promise.all([
    fetchDepartmentDetail(computerScience.slug),
    fetchDepartmentSection(computerScience.paths.about),
    fetchAllDepartmentSection(computerScience.paths.notices, 12),
    fetchAllDepartmentSection(computerScience.paths.usefulDownloads, 20),
    fetchAllDepartmentSection(computerScience.paths.previousYearPapers, 3),
    fetchAllDepartmentSection(computerScience.paths.attendance, 8),
    fetchDepartmentSection(computerScience.paths.phd),
    fetchDepartmentSection(computerScience.paths.postgraduate),
    fetchDepartmentSection(computerScience.paths.undergraduate)
  ]);

  const courseItems = [
    ...phd.items.map((c) => normalizeCourse(c, "Doctoral", computerScience.paths.phd)),
    ...pg.items.map((c) => normalizeCourse(c, "Post Graduate", computerScience.paths.postgraduate)),
    ...ug.items.map((c) => normalizeCourse(c, "Under Graduate", computerScience.paths.undergraduate))
  ];

  const previousPapers = papers.items.flatMap((item) => {
    const extracted = extractLinksFromHtml(item.link_description || "");
    if (!extracted.length) return [normalizeDepartmentFile(item, "Previous Year Paper", computerScience.paths.previousYearPapers)];
    return extracted.map((link, i) => ({
      id: `cs-paper-${item.id}-${i}`, title: link.title, category: "Previous Year Paper",
      date: formatDate(item.created_at || item.updated_at), updatedAt: formatDate(item.updated_at), url: link.url, source: "AMU Computer Science"
    }));
  });

  const links = (detail.links || []).map((group) => ({
    title: group.title,
    items: (group.get_related_link || []).map((link) => ({ title: link.link_name_en, url: `https://www.amu.ac.in/${link.slug}`, slug: link.slug }))
  }));

  const customLinks = (detail.customlinks || []).map((link) => ({ title: link.cus_link, url: link.rel_slug }));

  return {
    title: detail.title || computerScience.title,
    slug: computerScience.slug,
    officialUrl: computerScience.officialUrl,
    about: summarizeHtml(aboutSection.items[0]?.link_description || detail.description || detail.link_description || "", 420),
    links, customLinks,
    counts: {
      notices: notices.total || notices.items.length,
      downloads: downloads.total || downloads.items.length,
      previousPapers: previousPapers.length,
      attendance: attendance.total || attendance.items.length,
      courses: courseItems.length
    },
    lastUpdate: notices.lastUpdate || downloads.lastUpdate || papers.lastUpdate || "",
    courses: courseItems,
    notices: notices.items.map((item) => normalizeDepartmentFile(item, "CS Notice", computerScience.paths.notices)),
    materials: downloads.items.map((item) => normalizeDepartmentFile(item, "CS Notes and Downloads", computerScience.paths.usefulDownloads)),
    previousPapers,
    attendance: attendance.items.map((item) => normalizeDepartmentFile(item, "CS Attendance", computerScience.paths.attendance)),
    subjects: buildSubjectIndex([
      ...courseItems.map((c) => ({ title: `${c.name} ${c.subjectArea}`, url: c.url })),
      ...downloads.items.map((item) => normalizeDepartmentFile(item, "CS Notes and Downloads", computerScience.paths.usefulDownloads)),
      ...previousPapers
    ])
  };
}

async function fetchOnlineNotices(scope) {
  const url = `https://amuonline.ac.in/notices?scope=${encodeURIComponent(scope)}`;
  const html = await getText(url);
  const notices = [];
  const noticeRegex = /<div id="page"[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>[\s\S]*?<i class="fas fa-calendar-alt"><\/i>\s*([^<]+)/gi;
  let match;
  while ((match = noticeRegex.exec(html)) && notices.length < 12) {
    const href = match[1] || url;
    notices.push({
      id: `amuonline-${scope}-${notices.length}`,
      title: stripTags(match[2] || "AMU Online notice"),
      category: scope === "admissions" ? "Admission Notice" : "Examination Notice",
      date: match[3]?.trim() || "",
      url: href.startsWith("http") ? href : `https://amuonline.ac.in${href}`,
      source: "AMU Online"
    });
  }
  return notices.map((n, i) => ({ ...n, id: `amuonline-${scope}-${i}` }));
}

// ============================================================
// GEMINI AI INTEGRATION
// ============================================================

/**
 * Build AMU context for the AI to use when answering
 */
async function buildContext(message, profile = {}) {
  const contextParts = [
    "You are AMU.ai, an AI student assistant for Aligarh Muslim University (AMU).",
    "You help students with official AMU information: notices, results, exam schedules, admissions, departments, courses, scholarships, hostels, and contacts.",
    "Always be helpful, accurate, and friendly. Use the provided AMU data to answer questions.",
    "If the user asks about results, guide them to use the official result portal with their enrollment number.",
    "Keep responses concise but informative. When linking to official sources, explain what the student will find there.",
    "",
    "--- OFFICIAL AMU SOURCES ---"
  ];

  // Add source links
  Object.entries(sourceLinks).forEach(([name, url]) => {
    contextParts.push(`- ${name}: ${url}`);
  });

  // Add static knowledge entries that match the query
  const query = normalizeText(message);
  const relevantKnowledge = staticKnowledge.filter(entry => {
    const haystack = normalizeText(`${entry.title} ${entry.category} ${entry.summary} ${entry.keywords.join(" ")}`);
    return query.split(" ").some(token => token.length > 2 && haystack.includes(token));
  });

  if (relevantKnowledge.length > 0) {
    contextParts.push("", "--- RELEVANT AMU INFORMATION ---");
    relevantKnowledge.forEach(k => {
      contextParts.push(`[${k.category}] ${k.title}: ${k.summary}`);
    });
  }

  // Fetch recent notices if query seems to ask about notices
  if (query.includes("notice") || query.includes("latest") || query.includes("recent") || query.includes("circular") || query.includes("news")) {
    try {
      const notices = await fetchRecentNotices(message).catch(() => []);
      if (notices.length > 0) {
        contextParts.push("", "--- LATEST AMU NOTICES ---");
        notices.slice(0, 8).forEach(n => {
          contextParts.push(`- [${n.date}] ${n.title} (${n.url})`);
        });
      }
    } catch {}
  }

  // Fetch campus notices if relevant
  if (query.includes("campus") || query.includes("electricity") || query.includes("shutdown")) {
    try {
      const campusNotices = await fetchCampusNotices(message).catch(() => []);
      if (campusNotices.length > 0) {
        contextParts.push("", "--- CAMPUS NOTICES ---");
        campusNotices.slice(0, 5).forEach(n => {
          contextParts.push(`- [${n.date}] ${n.title} (${n.url})`);
        });
      }
    } catch {}
  }

  // Fetch CS department data if relevant
  const csKeywords = ["computer science", "computer application", "cs", "mca", "bsc", "msc", "notes", "study material", "previous paper", "subject code", "course", "syllabus"];
  if (csKeywords.some(k => query.includes(k))) {
    try {
      const csData = await fetchComputerScienceHub().catch(() => null);
      if (csData) {
        contextParts.push("", "--- COMPUTER SCIENCE DEPARTMENT DATA ---");
        contextParts.push(`Courses: ${csData.counts.courses}, Notes: ${csData.counts.downloads}, Papers: ${csData.counts.previousPapers}, Notices: ${csData.counts.notices}, Attendance: ${csData.counts.attendance}`);
        contextParts.push(`About: ${csData.about}`);
        if (csData.courses.length > 0) {
          contextParts.push("", "Courses offered:");
          csData.courses.slice(0, 8).forEach(c => {
            contextParts.push(`- ${c.name} (${c.level}) - ${c.specialization}`);
          });
        }
        if (csData.materials.length > 0) {
          contextParts.push("", "Available notes/materials:");
          csData.materials.slice(0, 6).forEach(m => {
            contextParts.push(`- ${m.title} (${m.url})`);
          });
        }
        if (csData.previousPapers.length > 0) {
          contextParts.push("", "Previous year papers:");
          csData.previousPapers.slice(0, 6).forEach(p => {
            contextParts.push(`- ${p.title} (${p.url})`);
          });
        }
        if (csData.subjects.length > 0) {
          contextParts.push("", "Detected subject codes:");
          csData.subjects.slice(0, 10).forEach(s => {
            contextParts.push(`- ${s.code}: ${s.title} (found in ${s.count} items)`);
          });
        }
      }
    } catch {}
  }

  // Fetch admission notices if relevant
  if (query.includes("admission") || query.includes("admit card") || query.includes("entrance")) {
    try {
      const admissionNotices = await fetchOnlineNotices("admissions").catch(() => []);
      if (admissionNotices.length > 0) {
        contextParts.push("", "--- ADMISSION NOTICES ---");
        admissionNotices.slice(0, 5).forEach(n => {
          contextParts.push(`- [${n.date}] ${n.title} (${n.url})`);
        });
      }
    } catch {}
  }

  // Fetch examination notices if relevant
  if (query.includes("exam notice") || query.includes("hall ticket") || query.includes("re-evaluation")) {
    try {
      const examNotices = await fetchOnlineNotices("examinations").catch(() => []);
      if (examNotices.length > 0) {
        contextParts.push("", "--- EXAMINATION NOTICES ---");
        examNotices.slice(0, 5).forEach(n => {
          contextParts.push(`- [${n.date}] ${n.title} (${n.url})`);
        });
      }
    } catch {}
  }

  // Add department info if asked
  if (query.includes("department")) {
    try {
      const depts = await fetchDepartments().catch(() => []);
      if (depts.length > 0) {
        contextParts.push("", "--- DEPARTMENTS ---");
        const queryDept = normalizeText(message);
        const matches = depts.filter(d => normalizeText(d.title).includes(queryDept)).slice(0, 10);
        if (matches.length > 0) {
          matches.forEach(d => contextParts.push(`- ${d.title} (${d.url})`));
        } else {
          contextParts.push(`There are ${depts.length} departments at AMU. Some include:`);
          depts.slice(0, 15).forEach(d => contextParts.push(`- ${d.title}`));
        }
      }
    } catch {}
  }

  // Student profile info
  if (profile.enrollment || profile.department) {
    contextParts.push("", "--- STUDENT PROFILE ---");
    contextParts.push(`Enrollment: ${profile.enrollment || "Not set"}`);
    contextParts.push(`Department: ${profile.department || "Not set"}`);
  }

  contextParts.push("", "--- INSTRUCTION ---");
  contextParts.push("Answer the student's question based on the AMU data above. Be helpful and concise.");
  contextParts.push("If the student asks about something not covered, point them to the relevant official AMU source.");
  contextParts.push("For results, explain they need to visit the official result portal with their enrollment/faculty number.");
  contextParts.push("Format your response naturally. Include relevant links when appropriate.");

  return contextParts.join("\n");
}

/**
 * Call Google Gemini AI to generate a response
 */
async function askGemini(systemContext, userMessage) {
  if (!GEMINI_API_KEY) {
    return null; // No API key configured
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemContext}\n\nStudent question: ${userMessage}` }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          topP: 0.9,
          topK: 40
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error ${response.status}:`, errorText);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return text.trim();
  } catch (err) {
    console.error("Gemini API call failed:", err.message);
    return null;
  }
}

/**
 * Fallback: extract links from AI response
 */
function extractLinksFromResponse(text) {
  const links = [];
  const urlRegex = /https?:\/\/[^\s)]+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0].replace(/[.)]+$/, "");
    // Find which static knowledge entry this matches
    const entry = staticKnowledge.find(k => k.url === url) || staticKnowledge.find(k => url.includes(k.url));
    if (entry) {
      links.push({ title: entry.title, subtitle: entry.category, url: entry.url });
    } else {
      links.push({ title: "AMU Official Source", subtitle: "Open link", url });
    }
  }
  return links;
}

// ============================================================
// INTENT DETECTION (FALLBACK)
// ============================================================
function detectIntent(message) {
  const text = normalizeText(message);
  const rules = [
    ["result", ["result", "marks", "grade", "pass", "fail"]],
    ["examSchedule", ["schedule", "date sheet", "datesheet", "timetable", "time table", "scheme"]],
    ["registration", ["registration", "exam form", "continuation", "readmission", "oeps"]],
    ["admission", ["admission", "admit card", "entrance", "application", "neet"]],
    ["csPapers", ["previous paper", "previous year", "question paper", "papers", "paper"]],
    ["csNotes", ["notes", "note", "lab manual", "manual", "study material", "material", "downloads", "download"]],
    ["csCourses", ["courses", "course", "subjects", "subject", "syllabus", "mca", "msc", "bsc", "phd"]],
    ["csAttendance", ["attendance"]],
    ["campusNotice", ["campus", "electricity", "shutdown"]],
    ["notice", ["notice", "notices", "circular", "latest", "recent", "notification"]],
    ["department", ["department", "dept", "faculty", "chairman", "syllabus", "course"]],
    ["scholarship", ["scholarship", "fee", "refund", "stipend", "student section"]],
    ["hostel", ["hostel", "hall", "residence", "provost", "room"]],
    ["contact", ["contact", "phone", "email", "office", "help"]]
  ];
  return rules.find(([, words]) => words.some(w => text.includes(w)))?.[0] || "general";
}

function isComputerScienceContext(message, profile = {}) {
  const text = normalizeText(`${message} ${profile.department || ""}`);
  return text.includes("computer science") || text.includes("computer application") ||
    text.includes("cyber security") || /\bcs\b/.test(text) || /\bmca\b/.test(text) ||
    /\bbsc\b/.test(text) || /\bmsc\b/.test(text);
}

function profileLine(profile = {}) {
  return `${profile.enrollment ? `Enrollment ${profile.enrollment}` : "your enrollment number"}, ${profile.department ? `${profile.department} department` : "your department"}`;
}

function rankKnowledge(message) {
  const text = normalizeText(message);
  return staticKnowledge
    .map((entry) => {
      const haystack = normalizeText(`${entry.title} ${entry.category} ${entry.summary} ${entry.keywords.join(" ")}`);
      const score = text.split(" ").filter(Boolean).reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { ...entry, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function makeLinkItem(item) {
  return { title: item.title, subtitle: [item.category, item.date, item.source].filter(Boolean).join(" - "), url: item.url };
}

function makeCourseLinkItem(course) {
  return { title: course.name, subtitle: [course.level, `Seats: ${course.seats}`, course.specialization].filter(Boolean).join(" - "), url: course.url };
}

// ============================================================
// CHAT ANSWER ENGINE (AI-first, with rule-based fallback)
// ============================================================
function sanitizeProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const enrollment = typeof source.enrollment === "string" ? source.enrollment.trim().slice(0, 40) : "";
  const department = typeof source.department === "string" ? source.department.trim().slice(0, 80) : "";
  return { enrollment, department };
}

async function answerChat(message, profile = {}) {
  profile = sanitizeProfile(profile);
  // Try AI first if API key is available
  if (GEMINI_API_KEY) {
    try {
      const context = await buildContext(message, profile);
      const aiResponse = await askGemini(context, message);

      if (aiResponse) {
        // Extract links from the response
        const links = extractLinksFromResponse(aiResponse);
        // Clean links from the response text
        const cleanText = aiResponse.replace(/https?:\/\/[^\s)]+/g, "").replace(/\s+/g, " ").trim();

        return {
          answer: cleanText || aiResponse,
          intent: detectIntent(message),
          confidence: "high",
          links: links.length > 0 ? links : staticKnowledge.filter(k => {
            const query = normalizeText(message);
            const haystack = normalizeText(`${k.title} ${k.category} ${k.summary} ${k.keywords.join(" ")}`);
            return query.split(" ").some(token => token.length > 2 && haystack.includes(token));
          }).slice(0, 3).map(makeLinkItem),
          profileEcho: { enrollment: profile.enrollment || "", department: profile.department || "" },
          disclaimer: "AMU.ai uses Google Gemini AI with official AMU data. Verify final details on official AMU pages."
        };
      }
    } catch (err) {
      console.error("AI fallback triggered:", err.message);
      // Fall through to rule-based
    }
  }

  // ============ RULE-BASED FALLBACK ============
  const intent = detectIntent(message);
  const departmentHint = profile.department || "your department";
  const query = profile.department && intent === "department" ? profile.department : message;
  let answer = "";
  let links = [];
  let confidence = "medium";

  if (["csNotes", "csCourses", "csPapers", "csAttendance"].includes(intent) && isComputerScienceContext(message, profile)) {
    const hub = await fetchComputerScienceHub();
    if (intent === "csNotes") {
      answer = `I found ${hub.counts.downloads} official Computer Science notes/download items from AMU, including lab manuals and project guidelines.`;
      links = hub.materials.slice(0, 10).map(makeLinkItem);
    } else if (intent === "csCourses") {
      answer = `The AMU Computer Science department currently exposes ${hub.counts.courses} course entries and ${hub.subjects.length} detected subject/code references from official course and notes data.`;
      links = hub.courses.map(makeCourseLinkItem);
      if (hub.subjects.length) {
        links = links.concat(hub.subjects.slice(0, 6).map(s => ({
          title: `${s.code} - ${s.title}`,
          subtitle: `Detected in ${s.count} official CS item(s)`,
          url: s.url
        })));
      }
    } else if (intent === "csPapers") {
      answer = `I found ${hub.counts.previousPapers} official Computer Science previous-year paper links from AMU.`;
      links = hub.previousPapers.slice(0, 10).map(makeLinkItem);
    } else {
      answer = `I found ${hub.counts.attendance} official Computer Science attendance-record items from AMU.`;
      links = hub.attendance.slice(0, 10).map(makeLinkItem);
    }
    confidence = "high";
  } else if (intent === "result") {
    answer = `For ${profileLine(profile)}, results should be checked on the official AMU Controller result portal. AMU.ai cannot display private marks directly, but it can take you to the official page where you can use your enrollment/faculty details.`;
    links = [makeLinkItem(staticKnowledge.find(i => i.id === "results"))];
    confidence = "high";
  } else if (intent === "examSchedule") {
    answer = `The official examination schedule is maintained on AMU's result/scheme display. Open it and search by course or faculty.`;
    links = [makeLinkItem(staticKnowledge.find(i => i.id === "schedule"))];
    confidence = "high";
  } else if (intent === "registration") {
    answer = `For registration, continuation, re-admission, and exam forms, use AMU's official online examination processing system.`;
    links = [makeLinkItem(staticKnowledge.find(i => i.id === "registration"))];
    confidence = "high";
  } else if (intent === "admission") {
    const notices = await fetchOnlineNotices("admissions").catch(() => []);
    answer = "Here are the latest admission notice links I found from AMU Online.";
    links = notices.length ? notices.slice(0, 5).map(makeLinkItem) : [makeLinkItem(staticKnowledge.find(i => i.id === "admission-notices"))];
    confidence = notices.length ? "high" : "medium";
  } else if (intent === "department") {
    const departments = await fetchDepartments().catch(() => []);
    const normalizedQuery = normalizeText(query);
    const matches = departments.filter(d => normalizeText(`${d.title} ${d.slug}`).includes(normalizedQuery)).slice(0, 6);
    const fallbackMatches = departments.filter(d => normalizeText(d.title).split(" ").some(t => normalizeText(message).includes(t))).slice(0, 6);
    const finalMatches = matches.length ? matches : fallbackMatches;
    answer = finalMatches.length ? `I found official AMU department pages related to ${departmentHint}.` : `I could not pinpoint the department page, but the official AMU department list is the best place to continue.`;
    links = finalMatches.length ? finalMatches.map(i => ({ title: i.title, subtitle: "Official AMU department page", url: i.url })) : [makeLinkItem(staticKnowledge.find(i => i.id === "departments"))];
    confidence = finalMatches.length ? "high" : "medium";
  } else if (intent === "campusNotice") {
    const notices = await fetchCampusNotices(message).catch(() => []);
    answer = "I searched AMU's official campus notice feed.";
    links = notices.length ? notices.slice(0, 5).map(makeLinkItem) : [makeLinkItem(staticKnowledge.find(i => i.id === "campus-notices"))];
    confidence = notices.length ? "high" : "medium";
  } else if (intent === "notice" || intent === "scholarship") {
    let notices = await fetchRecentNotices(intent === "scholarship" ? "scholarship" : message).catch(() => []);
    let usedLatestFallback = false;
    if (!notices.length && intent === "notice") {
      notices = await fetchRecentNotices().catch(() => []);
      usedLatestFallback = Boolean(notices.length);
    }
    answer = intent === "scholarship"
      ? "I searched AMU's official recent notices for scholarship, fee, refund, and student-section style updates."
      : usedLatestFallback ? "I did not find an exact notice-text match, so here are the latest official AMU notices." : "Here are recent official AMU notices matching your question.";
    links = notices.length ? notices.slice(0, 6).map(makeLinkItem) : [makeLinkItem(staticKnowledge.find(i => i.id === "recent-notices"))];
    confidence = notices.length ? "high" : "medium";
  } else if (intent === "hostel") {
    answer = "Hostel and hall updates are usually published as AMU notices or by the relevant hall/office. Start with recent notices and search your hall name.";
    const notices = await fetchRecentNotices("hostel").catch(() => []);
    links = notices.length ? notices.slice(0, 5).map(makeLinkItem) : [{ title: "AMU Recent Notices", subtitle: "Search hostel or hall related circulars", url: sourceLinks.recentNotices }];
  } else if (intent === "contact") {
    answer = "For official contact details, use the AMU website and the relevant department or office page. I can also find a department if you ask by name.";
    links = [{ title: "AMU Official Website", subtitle: "University home", url: sourceLinks.officialHome }, { title: "AMU Departments", subtitle: "Department pages", url: sourceLinks.departments }];
  } else {
    const ranked = rankKnowledge(message);
    answer = ranked.length ? `I found these AMU official resources for ${profileLine(profile)}.` : "I could not find an exact match. Try asking about notices, results, admission, exam schedule, registration, department, scholarship, fee, or hostel.";
    links = ranked.length ? ranked.map(makeLinkItem) : Object.entries(sourceLinks).slice(0, 4).map(([title, url]) => ({
      title: title.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, c => c.toUpperCase()),
      subtitle: "Official AMU resource",
      url
    }));
  }

  return {
    answer,
    intent,
    confidence,
    links,
    profileEcho: { enrollment: profile.enrollment || "", department: profile.department || "" },
    disclaimer: "AMU.ai uses public official AMU sources and links back to them. Verify final dates, marks, eligibility, and fees on the official AMU pages."
  };
}

// ============================================================
// SNAPSHOT
// ============================================================
async function collectSnapshot() {
  const [recent, departments, examNotices, admissionNotices] = await Promise.allSettled([
    fetchRecentNotices(), fetchDepartments(), fetchOnlineNotices("examinations"), fetchOnlineNotices("admissions")
  ]);
  return {
    generatedAt: new Date().toISOString(),
    sources: sourceLinks,
    recentNotices: recent.status === "fulfilled" ? recent.value.slice(0, 8) : [],
    departments: departments.status === "fulfilled" ? departments.value.slice(0, 150) : [],
    examinationNotices: examNotices.status === "fulfilled" ? examNotices.value : [],
    admissionNotices: admissionNotices.status === "fulfilled" ? admissionNotices.value : []
  };
}

// ============================================================
// HTTP SERVER
// ============================================================
function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    ...SECURITY_HEADERS
  });
  res.end(body);
}

async function readRequestJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body too large");
  }
  return body ? JSON.parse(body) : {};
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end("Forbidden"); return; }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream", "cache-control": "no-cache", ...SECURITY_HEADERS });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && reqUrl.pathname === "/health") {
      jsonResponse(res, 200, {
        status: "ok",
        name: "amu-ai",
        version: PACKAGE_VERSION,
        aiConfigured: Boolean(GEMINI_API_KEY),
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      });
      return;
    }
    if (req.method === "GET" && reqUrl.pathname === "/api/snapshot") { jsonResponse(res, 200, await collectSnapshot()); return; }
    if (req.method === "GET" && reqUrl.pathname === "/api/notices/recent") { jsonResponse(res, 200, { items: await fetchRecentNotices(reqUrl.searchParams.get("search") || "") }); return; }
    if (req.method === "GET" && reqUrl.pathname === "/api/notices/campus") { jsonResponse(res, 200, { items: await fetchCampusNotices(reqUrl.searchParams.get("search") || "") }); return; }
    if (req.method === "GET" && reqUrl.pathname === "/api/departments") { jsonResponse(res, 200, { items: await fetchDepartments() }); return; }
    if (req.method === "GET" && reqUrl.pathname === "/api/computer-science") { jsonResponse(res, 200, await fetchComputerScienceHub()); return; }
    if (req.method === "POST" && reqUrl.pathname === "/api/chat") {
      if (!checkRateLimit(req.socket.remoteAddress || "unknown")) {
        jsonResponse(res, 429, { error: "Too many chat requests. Please wait a minute and try again." });
        return;
      }
      const payload = await readRequestJson(req);
      const message = String(payload.message || "").trim();
      if (!message) { jsonResponse(res, 400, { error: "Message is required." }); return; }
      if (message.length > MAX_MESSAGE_LENGTH) {
        jsonResponse(res, 400, { error: `Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.` });
        return;
      }
      jsonResponse(res, 200, await answerChat(message, payload.profile));
      return;
    }
    if (reqUrl.pathname.startsWith("/api/") || reqUrl.pathname === "/health") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8", "allow": "GET, POST" }); res.end("Method not allowed");
      return;
    }
    if (req.method === "GET") { await serveStatic(req, res, reqUrl.pathname); return; }
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" }); res.end("Method not allowed");
  } catch (error) {
    console.error(`[amu-ai] ${req.method} ${reqUrl.pathname} failed:`, error.message);
    if (process.env.NODE_ENV === "production") {
      jsonResponse(res, 500, { error: "AMU.ai could not complete that request. Please try again shortly." });
    } else {
      jsonResponse(res, 500, { error: "AMU.ai could not complete that request.", detail: error.message });
    }
  }
});

if (require.main === module) {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║        AMU.ai v2.0 — AI Student         ║`);
  console.log(`  ║        Assistant for Aligarh Muslim     ║`);
  console.log(`  ║        University                       ║`);
  console.log(`  ╠══════════════════════════════════════════╣`);
  if (GEMINI_API_KEY) {
    console.log(`  ║  ✓ Gemini AI: Connected                  ║`);
  } else {
    console.log(`  ║  ⚠ Gemini AI: No API key (using fallback) ║`);
    console.log(`  ║    Set GEMINI_API_KEY in .env for AI     ║`);
  }
  console.log(`  ║  Server: http://localhost:${PORT}          ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
  server.listen(PORT, () => {});
}

module.exports = {
  answerChat, detectIntent, fetchDepartments, fetchRecentNotices,
  fetchComputerScienceHub, fetchOnlineNotices, normalizeText, server
};