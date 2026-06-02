const assert = require("node:assert/strict");
const { answerChat, detectIntent, fetchComputerScienceHub, normalizeText } = require("./server");

async function run() {
  assert.equal(normalizeText("B.Sc. (Hons.) Result!"), "b sc hons result");
  assert.equal(detectIntent("show my result"), "result");
  assert.equal(detectIntent("latest notices for computer science"), "notice");
  assert.equal(detectIntent("show latest notices for my department"), "notice");
  assert.equal(detectIntent("exam date sheet"), "examSchedule");
  assert.equal(detectIntent("department of computer science"), "department");
  assert.equal(detectIntent("computer science courses and subjects"), "csCourses");
  assert.equal(detectIntent("cs notes"), "csNotes");

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

  console.log("\n  ✓ All AMU.ai v2.0 tests passed\n");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});