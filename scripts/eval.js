/* A small, repeatable check of the plan reviewer against a running Litmus server (node server.js).
 *
 *   node scripts/eval.js            every case twice
 *   EVAL_RUNS=3 node scripts/eval.js
 *
 * Each case is a contributor plan for issue #1 of the demo repository with a known right answer:
 *   deadlock   calls delete_document() while store_document() holds a non-reentrant Lock; must be major_gaps
 *              and must name the deadlock
 *   safe       evicts inside the one lock it already holds; must not be major_gaps and must not claim a deadlock
 *   api_break  renames get_stats() that a route depends on; must be major_gaps or minor_gaps
 *
 * Every run uses a fresh contributor name, so it is judged as a first plan, not a revision. It prints the
 * pass rate, time, cost and how many citations Litmus could confirm in the code. Each plan check costs about
 * two to three cents of Otari balance. Options (env): LITMUS_URL, EVAL_RUNS.
 */
const base = (process.env.LITMUS_URL || `http://localhost:${process.env.LITMUS_PORT || 4173}`).replace(/\/$/, '');
const runs = Number(process.env.EVAL_RUNS || 2);
const repo = 'Vidhaankhare16/Google-Gen-AI';
const docsLink = 'I read https://docs.python.org/3/library/threading.html#lock-objects first.';

const deadlockWords = /deadlock|re-?acquir|non-?reentrant|not re-?entrant|blocks forever/i;
const cases = [
  {
    id: 'deadlock',
    plan: `When storage reaches max_documents, inside store_document I will call self.delete_document(oldest_id) to evict the oldest entry by created_at, then insert the new document and bump an evicted counter that get_stats() reports. ${docsLink} I will add a test that fills the store past the cap.`,
    pass: result => result.plan_soundness === 'major_gaps' && deadlockWords.test(JSON.stringify(result.points))
  },
  {
    id: 'safe',
    plan: `I will add max_documents=1000 as an optional argument of DocumentStorage.__init__. In store_document, inside the "with self._lock" block it already holds, if len(self.documents) >= self.max_documents I will find the oldest id by created_at, pop it from self.documents directly (not through delete_document), and increment self.evicted. After the lock is released I will call self._evict(oldest_id) so the vector store is cleaned up the same way cleanup_expired does it. get_stats() keeps its three keys and gains "evicted_documents". ${docsLink} I will add a test that stores max_documents + 1 documents.`,
    pass: result => result.plan_soundness !== 'major_gaps' && !/would deadlock|will deadlock|causes? a deadlock|deadlocks/i.test(JSON.stringify(result.points))
  },
  {
    id: 'api_break',
    plan: 'To keep the code small I will rename DocumentStorage.get_stats() to stats() and make it return only total_documents, then add the eviction cap inside store_document. I will not touch any other file.',
    pass: result => ['major_gaps', 'minor_gaps'].includes(result.plan_soundness) && result.points.length > 0
  }
];

async function check(plan, username) {
  const started = Date.now();
  const response = await fetch(`${base}/api/analyze-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, issueNumber: 1, username, plan }) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, seconds: (Date.now() - started) / 1000 };
}

(async () => {
  const health = await fetch(`${base}/api/health`).then(response => response.json()).catch(() => null);
  if (!health) { console.error(`No Litmus server at ${base}. Start it with npm start.`); process.exit(1); }
  console.log(`Litmus at ${base} · reviewer ${health.roles?.reviewer} · ${cases.length} cases × ${runs} runs\n`);
  const stamp = Date.now().toString(36);
  const rows = [];
  for (const item of cases) {
    for (let run = 0; run < runs; run += 1) {
      const { status, data, seconds } = await check(item.plan, `eval-${item.id}-${stamp}-${run}`);
      const ok = status === 200 && !data.blocked;
      const passed = ok && item.pass(data);
      const row = { case: item.id, run: run + 1, passed, seconds, soundness: data.plan_soundness || null, points: data.points?.length ?? null,
        citations: data.citations || null, costUsd: ok ? (data.otari?.costUsd || 0) + (data.grounding?.research?.otari?.costUsd || 0) : null,
        reviewer: ok ? `${data.otari.provider}:${data.otari.model}` : null, error: ok ? null : (data.error || `HTTP ${status}`) };
      rows.push(row);
      console.log(`${passed ? 'PASS' : 'FAIL'}  ${item.id.padEnd(9)} run ${row.run}  ${row.soundness || '-'}  ${row.points ?? '-'} points  ${seconds.toFixed(0)} s  ${row.citations ? `${row.citations.verified}/${row.citations.total} citations confirmed` : ''}  ${row.reviewer || row.error}`);
    }
  }
  const done = rows.filter(row => !row.error);
  const sum = (list, key) => list.reduce((total, row) => total + (row[key] || 0), 0);
  const cited = done.reduce((total, row) => total + (row.citations?.total || 0), 0);
  const confirmed = done.reduce((total, row) => total + (row.citations?.verified || 0), 0);
  console.log(`\n${rows.filter(row => row.passed).length} of ${rows.length} passed`);
  for (const item of cases) { const mine = rows.filter(row => row.case === item.id); console.log(`  ${item.id.padEnd(9)} ${mine.filter(row => row.passed).length}/${mine.length}`); }
  if (done.length) console.log(`median time ${done.map(row => row.seconds).sort((a, b) => a - b)[Math.floor(done.length / 2)].toFixed(0)} s · average cost $${(sum(done, 'costUsd') / done.length).toFixed(4)} per plan check · ${confirmed}/${cited} citations confirmed in the code`);
  process.exitCode = rows.every(row => row.passed) ? 0 : 1;
})();
