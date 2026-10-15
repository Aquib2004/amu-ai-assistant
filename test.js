process.env.RATE_LIMIT_MAX = "3"; // low limit so the HTTP tests can verify 429 behavior

const assert = require("node:assert/strict");
const { answerChat, detectIntent, fetchComputerScienceHub, normalizeText, server } = require("./server");

async function run() {
  // ---------- Unit: text + intent engine ----------
  assert.equal(normalizeText("B.Sc. (Hons.) Result!"), "b sc hons result");
  assert.equal(detectIntent("show my result"), "result");
  assert.equal(detectIntent("latest notices for computer science"), "notice");
  assert.equal(detectIntent("show latest notices for my department"), "notice");
  assert.equal(detectIntent("exam date sheet"), "examSchedule");
  assert.equal(detectIntent("department of computer science"), "department");
  assert.equal(detectIntent("computer science courses and subjects"), "csCourses");
  assert.equal(detectIntent("cs notes"), "csNotes");

  // ---------- Unit: answer engine ----------
  const resultAnswer = await answerChat("show my result", {
    enrollment: "GK1234",
    department: "Computer Science"
  });
  assert.equal(resultAnswer.intent, "result");
  assert.ok(resultAnswer.links.some((link) => link.url.includes("result_display")));

  const scheduleAnswer = await answerChat("exam time table", {
    enrollment: "GK1234",
    department: "Computer Science"
  });
  assert.equal(scheduleAnswer.intent, "examSchedule");
  assert.ok(scheduleAnswer.links.length > 0);

  const csHub = await fetchComputerScienceHub();
  assert.ok(csHub.counts.downloads >= 1);
  assert.ok(csHub.courses.length >= 1);
  assert.ok(csHub.materials.length >= 1);

  const csNotesAnswer = await answerChat("CS notes", {
    enrollment: "GK1234",
    department: "Computer Science"
  });
  assert.equal(csNotesAnswer.intent, "csNotes");
  assert.ok(csNotesAnswer.links.length > 0);

  // ---------- Unit: profile sanitization ----------
  const weirdProfile = { enrollment: 12345, department: "X".repeat(500), extra: "ignored" };
  const sanitized = await answerChat("hostel information", weirdProfile);
  assert.equal(sanitized.profileEcho.enrollment, "");
  assert.ok(sanitized.profileEcho.department.length <= 80);

  // ---------- Integration: HTTP endpoints ----------
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // Health endpoint
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.name, "amu-ai");
    assert.equal(typeof healthBody.aiConfigured, "boolean");

    // Security headers on API responses
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.ok(health.headers.get("content-security-policy"));

    // Static app shell
    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.ok((index.headers.get("content-type") || "").includes("text/html"));
    const indexHtml = await index.text();
    assert.ok(indexHtml.includes("AMU.ai"));
    assert.ok(index.headers.get("x-content-type-options") === "nosniff");

    const css = await fetch(`${base}/styles.css`);
    assert.equal(css.status, 200);
    const js = await fetch(`${base}/app.js`);
    assert.equal(js.status, 200);

    // Path traversal must not escape public/
    const traversal = await fetch(`${base}/%2e%2e/package.json`);
    assert.ok(traversal.status === 403 || traversal.status === 404);
    const traversalText = await traversal.text();
    assert.ok(!traversalText.includes('"dependencies"'));

    // Unknown route -> 404
    const missing = await fetch(`${base}/no-such-page`);
    assert.equal(missing.status, 404);

    // Wrong method on chat endpoint
    const wrongMethod = await fetch(`${base}/api/chat`);
    assert.equal(wrongMethod.status, 405);

    // Chat validation: empty message
    const emptyChat = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "" })
    });
    assert.equal(emptyChat.status, 400);

    // Chat validation: message too long
    const longChat = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "a".repeat(5000) })
    });
    assert.equal(longChat.status, 400);

    // One more valid chat fits exactly within RATE_LIMIT_MAX=3 (empty + long + this = 3)...
    const okChat = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hostel information", profile: { enrollment: "GK1234", department: "Computer Science" } })
    });
    assert.equal(okChat.status, 200);
    const okBody = await okChat.json();
    assert.equal(okBody.intent, "hostel");

    // ...then the next request inside the window must be rate limited (429).
    const limited = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hostel information" })
    });
    assert.equal(limited.status, 429);
    const limitedBody = await limited.json();
    assert.ok(limitedBody.error.toLowerCase().includes("too many"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log("\n  ✓ All AMU.ai v2.0 tests passed\n");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});