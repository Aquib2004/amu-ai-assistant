/* =============================================
   AMU.ai — AI Student Assistant
   Frontend Application
   ============================================= */

// ======================= STATE =======================
const state = {
  profile: JSON.parse(localStorage.getItem("amu.ai.profile") || "null"),
  departments: [],
  csHub: null,
  messages: [],
  isProcessing: false
};

// ======================= DOM REFS =======================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const el = {
  sidebar: $("#sidebar"),
  overlay: $("#sidebarOverlay"),
  openBtn: $("#openSidebar"),
  closeBtn: $("#closeSidebar"),
  profileCard: $("#profileCard"),
  profileSummary: $("#profileSummary"),
  resetBtn: $("#resetProfile"),
  profileForm: $("#profileForm"),
  enrollmentInput: $("#enrollmentInput"),
  departmentInput: $("#departmentInput"),
  departmentOptions: $("#departmentOptions"),
  messages: $("#messages"),
  chatForm: $("#chatForm"),
  messageInput: $("#messageInput"),
  sendBtn: $("#sendButton"),
  suggestions: $("#suggestions"),
  clearBtn: $("#clearChat"),
  sourceHealth: $("#sourceHealth"),
  csMiniContent: $("#csMiniContent"),
  topbarTitle: $(".topbar-title h2")
};

// ======================= THEME TOGGLE =======================
// Check saved theme, default to light
let currentTheme = localStorage.getItem("amu.ai.theme") || "light";
document.documentElement.setAttribute("data-theme", currentTheme);

// Add theme toggle to the page
function addThemeToggle() {
  const toggle = document.createElement("button");
  toggle.id = "themeToggle";
  toggle.className = "btn-icon";
  toggle.title = currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  toggle.setAttribute("aria-label", "Toggle theme");
  toggle.innerHTML = currentTheme === "dark"
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  
  toggle.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("amu.ai.theme", currentTheme);
    toggle.title = currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    toggle.innerHTML = currentTheme === "dark"
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  });

  // Insert after the clear button
  el.clearBtn.parentNode.insertBefore(toggle, el.clearBtn);
}

// ======================= PROFILE =======================
function saveProfile(profile) {
  state.profile = profile;
  localStorage.setItem("amu.ai.profile", JSON.stringify(profile));
  renderProfile();
}

function renderProfile() {
  if (state.profile) {
    el.profileSummary.textContent = `${state.profile.enrollment} — ${state.profile.department}`;
    el.profileForm.classList.add("hidden");
    el.messageInput.disabled = false;
    el.sendBtn.disabled = false;
    el.messageInput.placeholder = `Ask as ${state.profile.department} student...`;
  } else {
    el.profileSummary.textContent = "Not set — enter enrollment & department";
    el.profileForm.classList.remove("hidden");
    el.messageInput.disabled = true;
    el.sendBtn.disabled = true;
    el.messageInput.placeholder = "Set your profile first";
  }
}

// ======================= MESSAGES =======================
function addMessage(role, text, links = [], disclaimer = "") {
  const group = document.createElement("div");
  group.className = `message-group ${role}`;

  const body = document.createElement("div");
  body.className = "message-body";

  const bubble = document.createElement("div");
  bubble.className = "message-content";
  bubble.textContent = text;
  body.appendChild(bubble);

  if (links && links.length > 0) {
    const list = document.createElement("div");
    list.className = "message-links";
    links.forEach((link) => {
      const a = document.createElement("a");
      a.className = "link-card";
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      const title = document.createElement("strong");
      title.textContent = link.title || "AMU Resource";
      const subtitle = document.createElement("span");
      subtitle.textContent = link.subtitle || "Official AMU source";
      a.append(title, subtitle);
      list.appendChild(a);
    });
    body.appendChild(list);
  }

  if (disclaimer) {
    const note = document.createElement("p");
    note.className = "message-disclaimer";
    note.textContent = disclaimer;
    body.appendChild(note);
  }

  group.appendChild(body);
  el.messages.appendChild(group);
  el.messages.scrollTop = el.messages.scrollHeight;
  return group;
}

function addTypingIndicator() {
  const group = document.createElement("div");
  group.className = "message-group assistant";
  group.id = "typingIndicator";
  const body = document.createElement("div");
  body.className = "message-body";
  body.innerHTML = '<div class="message-content typing-indicator"><span></span><span></span><span></span></div>';
  group.appendChild(body);
  el.messages.appendChild(group);
  el.messages.scrollTop = el.messages.scrollHeight;
  return group;
}

function removeTypingIndicator() {
  const typing = document.getElementById("typingIndicator");
  if (typing) typing.remove();
}

function showWelcome() {
  el.messages.innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" stroke="currentColor" stroke-width="3" fill="none"/>
          <path d="M30 70 L50 25 L70 70" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M38 58 L62 58" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        </svg>
      </div>
      <h2>Welcome to AMU.ai</h2>
      <p>${state.profile ? `I'm ready for ${state.profile.department} queries. Ask me anything about AMU!` : "Set your student profile in the sidebar to get started."}</p>
    </div>`;
}

// ======================= CHAT API =======================
async function ask(message) {
  if (!state.profile || !message.trim() || state.isProcessing) return;

  state.isProcessing = true;
  addMessage("user", message.trim());
  el.messageInput.value = "";
  el.messageInput.disabled = true;
  el.sendBtn.disabled = true;
  addTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: message.trim(), profile: state.profile })
    });
    const data = await response.json();
    removeTypingIndicator();

    if (!response.ok) {
      addMessage("assistant", data.error || "Sorry, I couldn't process that request.");
      return;
    }

    addMessage("assistant", data.answer, data.links || [], data.disclaimer);
  } catch (err) {
    removeTypingIndicator();
    addMessage("assistant", "⚠️ The server is not reachable. Please make sure AMU.ai is running (`npm start`) and try again.");
  } finally {
    state.isProcessing = false;
    el.messageInput.disabled = false;
    el.sendBtn.disabled = false;
    el.messageInput.focus();
  }
}

// ======================= HYDRATE AMU DATA =======================
async function hydrateSources() {
  try {
    const [snapRes, csRes] = await Promise.all([
      fetch("/api/snapshot"),
      fetch("/api/computer-science")
    ]);
    const snapshot = await snapRes.json();
    const csData = await csRes.json();
    state.csHub = csData;

    // Update source health
    const counts = [
      `📋 ${snapshot.recentNotices.length} Notices`,
      `📝 ${snapshot.examinationNotices.length} Exam`,
      `🎓 ${snapshot.admissionNotices.length} Admissions`,
      `🏛️ ${snapshot.departments.length} Departments`
    ];
    el.sourceHealth.replaceChildren(
      ...counts.map((text) => {
        const span = document.createElement("span");
        span.className = "status-healthy";
        span.textContent = text;
        return span;
      })
    );

    // Populate department datalist
    state.departments = snapshot.departments || [];
    el.departmentOptions.replaceChildren(
      ...state.departments.map((d) => {
        const opt = document.createElement("option");
        opt.value = d.title;
        return opt;
      })
    );

    // Render CS mini stats
    renderCsMini(csData);
  } catch (err) {
    el.sourceHealth.innerHTML = '<span class="status-checking">⚠️ Could not reach AMU sources</span>';
    el.csMiniContent.innerHTML = '<p class="status-checking">Data unavailable</p>';
  }
}

function renderCsMini(hub) {
  if (!hub) return;
  const stats = [
    ["Courses", hub.counts.courses],
    ["Notes", hub.counts.downloads],
    ["Papers", hub.counts.previousPapers],
    ["Notices", hub.counts.notices],
    ["Attendance", hub.counts.attendance]
  ];
  el.csMiniContent.replaceChildren(
    ...stats.map(([label, value]) => {
      const row = document.createElement("div");
      row.className = "cs-mini-stat";
      row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return row;
    })
  );
}

// ======================= EVENT LISTENERS =======================

// Sidebar toggle
el.openBtn.addEventListener("click", () => {
  el.sidebar.classList.add("open");
  el.overlay.classList.add("open");
});

el.closeBtn.addEventListener("click", closeSidebar);
el.overlay.addEventListener("click", closeSidebar);

function closeSidebar() {
  el.sidebar.classList.remove("open");
  el.overlay.classList.remove("open");
}

// Profile form
el.profileForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const enrollment = el.enrollmentInput.value.trim();
  const department = el.departmentInput.value.trim();
  if (!enrollment || !department) return;

  saveProfile({ enrollment, department });
  showWelcome();
  addMessage("assistant", `✅ Profile set! Welcome ${enrollment} from ${department}. I can help you with notices, results, exam schedules, departments, scholarships, and more. Try one of the suggestions below.`);
  el.messageInput.focus();
  closeSidebar();
});

// Reset profile
el.resetBtn.addEventListener("click", () => {
  localStorage.removeItem("amu.ai.profile");
  state.profile = null;
  el.enrollmentInput.value = "";
  el.departmentInput.value = "";
  renderProfile();
  showWelcome();
  addMessage("assistant", "Profile reset. Enter your enrollment number and department to start again.");
});

// Chat form
el.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = el.messageInput.value.trim();
  if (msg) ask(msg);
});

// Suggestion chips
el.suggestions.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const msg = chip.dataset.msg;
  if (msg) ask(msg);
});

// Clear chat
el.clearBtn.addEventListener("click", () => {
  el.messages.innerHTML = "";
  showWelcome();
});

// Keyboard shortcut: Enter to send, already handled by form submit
// Auto-resize not needed for single line input

// ======================= INIT =======================
function init() {
  addThemeToggle();
  renderProfile();
  showWelcome();
  hydrateSources();

  // If profile exists, focus input
  if (state.profile) {
    el.messageInput.focus();
  }
}

init();