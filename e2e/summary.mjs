// Prints pass/fail tables (Markdown) from Playwright's results.json.
// Usage: npm run summary          (after `npx playwright test`)
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(new URL('./results.json', import.meta.url)));

// Flatten the nested suite tree into one row per (test, browser)
const rows = [];
(function walk(suite) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      rows.push({
        module: spec.file.split('/')[0],                // auth, appointments, admin, ...
        title: spec.title,
        browser: t.projectName,
        passed: t.status === 'expected',
        skipped: t.status === 'skipped',
      });
    }
  }
  (suite.suites ?? []).forEach(walk);
})({ suites: report.suites });

function table(groupBy) {
  const groups = new Map();
  for (const r of rows) {
    const g = groups.get(r[groupBy]) ?? { pass: 0, fail: 0, skip: 0 };
    r.skipped ? g.skip++ : r.passed ? g.pass++ : g.fail++;
    groups.set(r[groupBy], g);
  }
  let total = { pass: 0, fail: 0, skip: 0 };
  console.log(`| ${groupBy} | passed | failed | pass rate |\n|---|---|---|---|`);
  for (const [k, g] of groups) {
    console.log(`| ${k} | ${g.pass} | ${g.fail} | ${((100 * g.pass) / (g.pass + g.fail)).toFixed(1)}% |`);
    total = { pass: total.pass + g.pass, fail: total.fail + g.fail, skip: total.skip + g.skip };
  }
  console.log(`| **total** | **${total.pass}** | **${total.fail}** | **${((100 * total.pass) / (total.pass + total.fail)).toFixed(1)}%** |\n`);
}

console.log(`Run started ${report.stats.startTime}, took ${(report.stats.duration / 1000).toFixed(0)} s\n`);
table('browser');
table('module');

// Tests whose result differs between browsers (browser-compatibility issues)
const byTitle = new Map();
for (const r of rows) byTitle.set(r.title, [...(byTitle.get(r.title) ?? []), r]);
const mixed = [...byTitle].filter(([, rs]) => new Set(rs.map((r) => r.passed)).size > 1);
console.log('Browser-dependent results:', mixed.length ? '' : 'none');
for (const [title, rs] of mixed) {
  console.log(`- ${title}: ` + rs.map((r) => `${r.browser} ${r.passed ? 'pass' : 'FAIL'}`).join(', '));
}

console.log('\nFailing tests (all browsers):');
for (const [title, rs] of byTitle) if (rs.every((r) => !r.passed && !r.skipped)) console.log(`- ${title}`);
