// Plain Node test harness for the Cold Email Grader engine.
// No framework, just assertions. Run with: node test.js
// Exits non-zero if any case fails.
//
// The expected values below are locked ground truth from the verified build.
// If a value does not match, the engine changed. Fix the engine, never the
// expected value.

const { analyze } = require("./engine.js");

let failures = 0;
const line = "-".repeat(60);

function report(name, passed, detail) {
  const status = passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${name}`);
  if (detail) console.log(detail);
  if (!passed) failures++;
}

// Compact view of the findings, handy when a case fails.
function findingTitles(result) {
  return result.findings.map(f => `  - (${f.severity}) ${f.title}`).join("\n");
}

// ---------- Case A: heavy spam, expected score 0 ----------
(() => {
  const subject = "RE: CONGRATULATIONS!! You've been SELECTED!!!";
  const body = [
    "Dear Friend,",
    "",
    "ACT NOW and BUY NOW to claim your 100% FREE gift!!! This is a limited time offer and it won't last. Click here: http://bit.ly/xyz123",
    "",
    "Make money fast, work from home, no cost, satisfaction guaranteed!!! Don't delete this, {{first_name}}. Order now and save big, best price, act immediately!!!"
  ].join("\n");

  const expected = 0;
  const r = analyze(subject, body);
  const passed = r.score === expected;
  report(
    "Case A (heavy spam)",
    passed,
    `  score: ${r.score} (expected ${expected}), grade: ${r.grade}` +
      (passed ? "" : "\n" + findingTitles(r))
  );
})();

// ---------- Case B: clean professional email, expected score 100 ----------
(() => {
  const subject = "Question about Acme's onboarding flow";
  const body = [
    "Hi Jordan,",
    "",
    "I noticed Acme just launched self-serve signup, congrats on shipping that. I help B2B teams cut their trial-to-paid drop-off.",
    "",
    "Would a quick 15 minute call next week be worth it? If not, no worries.",
    "",
    "Thanks,",
    "Sourya",
    "",
    "Unsubscribe here. 123 Example St, Bhaktapur."
  ].join("\n");

  const expected = 100;
  const r = analyze(subject, body);
  const passed = r.score === expected;
  report(
    "Case B (clean professional email)",
    passed,
    `  score: ${r.score} (expected ${expected}), grade: ${r.grade}` +
      (passed ? "" : "\n" + findingTitles(r))
  );
})();

// ---------- Case C: image-only HTML promo, expected score 57 ----------
(() => {
  const subject = "Our new spring sale is here";
  const body =
    '<html><body><table><tr><td><img src="promo.jpg" width="600"></td></tr>' +
    '<tr><td><a href="https://tinyurl.com/sale">Shop now</a></td></tr>' +
    "</table></body></html>";

  const expected = 57;
  const r = analyze(subject, body);
  const passed = r.score === expected;
  report(
    "Case C (image-only HTML promo)",
    passed,
    `  score: ${r.score} (expected ${expected}), grade: ${r.grade}` +
      (passed ? "" : "\n" + findingTitles(r))
  );
})();

// ---------- Case D: homoglyph behavior, expect the lookalike finding ----------
// Built with explicit unicode escapes so it survives copy-paste. The Cyrillic
// letters (U+0435 = e, U+0441 = c) sit inside otherwise normal English words.
// We do not assert an exact score, only that the finding is present.
(() => {
  const subject = "";
  const body =
    "Hello, we would like to offer you a fr" +
    "\u0435\u0435" + // Cyrillic small letter ie, twice
    " upgrade to your a" +
    "\u0441\u0441" + // Cyrillic small letter es, twice
    "ount. Please claim it before it expires.";

  const r = analyze(subject, body);
  const hit = r.findings.find(f => f.title === "Hidden lookalike characters");
  const passed = Boolean(hit);
  report(
    "Case D (homoglyph detection)",
    passed,
    passed
      ? `  found finding: "${hit.title}" (score ${r.score})`
      : `  expected a finding titled "Hidden lookalike characters" but did not find one\n` +
          findingTitles(r)
  );
})();

console.log(line);
if (failures === 0) {
  console.log("All 4 cases passed.");
  process.exit(0);
} else {
  console.log(`${failures} case(s) failed.`);
  process.exit(1);
}
