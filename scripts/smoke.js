/* Live smoke test: one tiny structured call per Litmus role through Otari.
 * Prints the provenance Otari reports (provider, served model, fallback, latency, cost, request id).
 * Reads OTARI_* and LITMUS_* settings from .env; never prints a key.   npm run smoke
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim(); const at = line.indexOf('=');
  if (!line || line.startsWith('#') || at < 1) continue;
  const key = line.slice(0, at).trim();
  if (process.env[key] === undefined) process.env[key] = line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
}
const otari = require('../otari');

(async () => {
  if (!otari.configured()) { console.error('OTARI_API_KEY is not set (in .env or the environment).'); process.exit(1); }
  console.log(`Otari gateway: ${otari.baseUrl()}\n`);
  let failures = 0;
  for (const role of Object.keys(otari.ROLES)) {
    const cfg = otari.roleConfig(role);
    const result = await otari.probeRole(role);
    if (result.ok) {
      console.log(`${role.padEnd(10)} ok   requested ${cfg.requested}${cfg.isPolicy ? ' (policy)' : ''}\n           served   ${result.provider}:${result.model} · ${result.latencyMs} ms · $${result.costUsd ?? '?'} · fallback ${result.fallback ? `yes (${result.attempts} attempts)` : 'no'} · ${result.outputMode}\n           request  ${result.requestId}${result.policyMissing ? `\n           note     routing policy "${result.policyMissing.policy}" is not configured; used ${result.policyMissing.fallbackModel}` : ''}\n`);
    } else {
      failures += 1;
      console.log(`${role.padEnd(10)} FAIL ${result.kind}: ${result.message}${result.requestId ? ` (request ${result.requestId})` : ''}\n`);
    }
    await new Promise(resolve => setTimeout(resolve, 2500)); // stay well inside free-tier provider rate limits
  }
  console.log(failures ? `${failures} role(s) failed.` : 'All roles answered through Otari.');
  setTimeout(() => process.exit(failures ? 1 : 0), 600);
})();
