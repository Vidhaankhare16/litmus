/* Litmus frontend — talks to the local Litmus API (server.js). */

let selectedMatch = null;
let orientation = null;
let planReview = null;
let prBrief = null;
let planDraft = '';
let journeyStage = 0;
let activeRepository = localStorage.getItem('litmus_repo') || '';
let activeUsername = localStorage.getItem('litmus_username') || '';

const views = document.querySelectorAll('.view');
function showView(id) { views.forEach(view => view.classList.toggle('active', view.id === id)); window.scrollTo(0, 0); }
function toast(message) { const item = document.querySelector('#toast'); item.textContent = message; item.classList.add('show'); setTimeout(() => item.classList.remove('show'), 4200); }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function pretty(value = '') { return escapeHtml(String(value).replaceAll('_', ' ')); }

function apiBases() {
  const configured = window.LITMUS_API_BASE_URL ? String(window.LITMUS_API_BASE_URL).replace(/\/$/, '') : '';
  const host = window.location.hostname;
  const protocol = /^https?:$/.test(window.location.protocol) ? window.location.protocol : 'http:';
  const localFallback = /^(localhost|127\.0\.0\.1)$/i.test(host) ? `${protocol}//${host}:4173` : '';
  const bases = configured ? [configured, ''] : [''];
  if (localFallback) bases.push(localFallback);
  return [...new Set(bases)];
}
async function apiCall(path, options) {
  let plainTextResponse = false;
  let networkError = null;
  for (const base of apiBases()) {
    try {
      const response = await fetch(`${base}${path}`, options);
      const raw = await response.text();
      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      if (!isJson) { plainTextResponse = true; continue; }
      const data = raw ? JSON.parse(raw) : {};
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    } catch (error) {
      networkError = error;
      if (error.message && !/Failed to fetch|NetworkError/i.test(error.message)) throw error;
    }
  }
  if (plainTextResponse || networkError) throw new Error('The Litmus API is not running at this address. Start it with `node server.js`, then open http://localhost:4173.');
  throw new Error('Litmus could not reach its API. Start it with `node server.js`, then open http://localhost:4173.');
}
async function request(path, body) { return apiCall(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

function enterRole(role) { showView(`${role}-view`); if (role === 'maintainer') loadRegisteredRepos(); }
function switchContributorTab(tab) {
  document.querySelectorAll('[data-contributor-tab]').forEach(button => button.classList.toggle('active', button.dataset.contributorTab === tab));
  document.querySelectorAll('.contributor-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${tab}-panel`));
  if (tab === 'trail') loadTrail();
}
function switchMaintainerTab(tab) {
  document.querySelectorAll('[data-maintainer-tab]').forEach(button => button.classList.toggle('active', button.dataset.maintainerTab === tab));
  document.querySelectorAll('.maintainer-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${tab}-panel`));
  if (tab === 'repos') loadRegisteredRepos();
  if (tab === 'bot') loadBotConsole();
}

/* ================= maintainer: Litmus bot ================= */

let botIssues = [];

function renderBotToggle(enabled) {
  const toggle = document.querySelector('#bot-toggle');
  toggle.classList.toggle('on', enabled);
  toggle.setAttribute('aria-checked', String(enabled));
  toggle.querySelector('.switch-label').textContent = enabled ? 'On' : 'Off';
}

async function loadBotIdentity() {
  const target = document.querySelector('#bot-identity');
  try {
    const identity = await apiCall('/api/bot/identity', { method: 'GET' });
    const render = {
      app: () => `<span class="bot-avatar">🧪</span><div><strong>Comments post as ${escapeHtml(identity.login)}</strong><p>Litmus has its own GitHub App identity on this repository.</p></div>`,
      token: () => `<span class="bot-avatar human">@</span><div><strong>Comments post as @${escapeHtml(identity.login)}</strong><p>Using your personal token. Install the Litmus GitHub App to give the bot its own identity.</p></div>`,
      app_error: () => `<span class="bot-avatar human">!</span><div><strong>GitHub App not usable</strong><p>${escapeHtml(identity.message)}${identity.fallback ? ' Falling back to your personal token.' : ''}</p></div>`,
      none: () => `<span class="bot-avatar human">!</span><div><strong>No GitHub write credentials</strong><p>Add GITHUB_TOKEN or configure the Litmus GitHub App to let the bot comment.</p></div>`
    }[identity.mode];
    target.innerHTML = render ? render() : '';
    target.className = `bot-identity ${identity.mode === 'app' ? 'is-app' : ''}`;
  } catch { target.innerHTML = ''; }
}

async function loadBotConsole() {
  loadBotIdentity();
  const area = document.querySelector('#bot-issue-area');
  const nameEl = document.querySelector('#bot-repo-name');
  const noteEl = document.querySelector('#bot-repo-note');
  if (!activeRepository) {
    nameEl.textContent = 'No repository connected';
    noteEl.textContent = 'Connect a repository in the Repositories tab first.';
    area.innerHTML = '';
    renderBotToggle(false);
    return;
  }
  nameEl.textContent = activeRepository;
  noteEl.textContent = 'When on, Litmus replies to volunteers on this repo\'s issues.';
  area.innerHTML = `<div class="match-loading active"><div class="loader"></div><span>Loading open issues…</span></div>`;
  try {
    const data = await apiCall(`/api/repo-issues?repo=${encodeURIComponent(activeRepository)}`, { method: 'GET' });
    renderBotToggle(data.bot.enabled);
    botIssues = data.issues;
    if (!botIssues.length) { area.innerHTML = '<p class="hint">No open issues in this repository.</p>'; return; }
    area.innerHTML = `<label for="bot-issue">PICK AN ISSUE</label>
      <div class="bot-issue-list">${botIssues.map(issue => `
        <button class="bot-issue" data-issue="${issue.number}">
          <span class="bot-issue-num">#${issue.number}</span>
          <span class="bot-issue-body"><strong>${escapeHtml(issue.title)}</strong>
          <span class="row-chips">${(issue.labels || []).map(label => `<span class="chip dim">${escapeHtml(label)}</span>`).join('')}${issue.bot ? `<span class="chip ${issue.bot.verdict === 'demonstrated_understanding' ? 'teal' : issue.bot.verdict === 'non_responsive' ? 'rose' : issue.bot.verdict ? 'amber' : 'purple'}">${issue.bot.verdict ? pretty(issue.bot.verdict) : 'question posted'}</span>` : ''}</span></span>
        </button>`).join('')}</div>`;
    area.querySelectorAll('[data-issue]').forEach(button => button.addEventListener('click', () => openBotIssue(Number(button.dataset.issue))));
  } catch (error) { area.innerHTML = `<p class="hint">${escapeHtml(error.message)}</p>`; }
}

function botThreadHtml(thread, issue) {
  const verdictChip = { demonstrated_understanding: 'teal', partial: 'amber', non_responsive: 'rose', no_reply_yet: 'dim' }[thread?.verdict] || 'dim';
  return `<article class="journey-card">
    <h2>#${issue.number} · ${escapeHtml(issue.title)}</h2>
    ${thread?.question ? `
      <div class="bot-message">
        <div class="bot-message-head"><span class="bot-avatar">🧪</span><strong>Litmus asked</strong>${thread.commentUrl ? `<a href="${escapeHtml(thread.commentUrl)}" target="_blank" rel="noreferrer">view on GitHub ↗</a>` : '<span class="chip dim">preview — not posted</span>'}</div>
        <p class="bot-question">${escapeHtml(thread.question.question)}</p>
        <div class="evidence">${escapeHtml(thread.question.evidence || '')}</div>
        <p class="bot-why">${escapeHtml(thread.question.why_this_matters || '')}</p>
      </div>` : `<p>Litmus hasn't asked anything on this issue yet.</p>`}
    ${(thread?.replies || []).map(reply => `
      <div class="bot-message reply">
        <div class="bot-message-head"><span class="bot-avatar human">@</span><strong>${escapeHtml(reply.author)} replied</strong><a href="${escapeHtml(reply.url)}" target="_blank" rel="noreferrer">view ↗</a></div>
        <p>${escapeHtml(reply.body.slice(0, 700))}</p>
      </div>`).join('')}
    ${thread?.verdict ? `
      <div class="bot-message verdict">
        <div class="bot-message-head"><span class="bot-avatar">🧪</span><strong>Litmus assessed</strong><span class="chip ${verdictChip}">${pretty(thread.verdict)}</span></div>
        <p>${escapeHtml(thread.assessment || '')}</p>
        ${thread.follow_up ? `<p class="bot-why"><strong>Follow-up asked:</strong> ${escapeHtml(thread.follow_up)}</p>` : ''}
        ${thread.maintainer_note ? `<div class="trail-note"><strong>For you:</strong> ${escapeHtml(thread.maintainer_note)}</div>` : ''}
      </div>` : ''}
    <div class="button-row">
      <button class="cta" id="bot-ask">${thread?.question ? 'Ask again' : 'Ask on GitHub'}</button>
      ${thread?.question ? `<button class="cta ghost" id="bot-assess">Read replies &amp; assess</button>` : ''}
      <a class="hint" href="${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">Open issue ↗</a>
    </div>
  </article>`;
}

async function openBotIssue(issueNumber) {
  const issue = botIssues.find(item => item.number === issueNumber);
  const target = document.querySelector('#bot-thread');
  target.innerHTML = `<div class="match-loading active"><div class="loader"></div><span>Loading thread…</span></div>`;
  let thread = null;
  try { thread = (await apiCall(`/api/bot/thread?repo=${encodeURIComponent(activeRepository)}&issueNumber=${issueNumber}`, { method: 'GET' })).thread; } catch { /* no thread yet */ }
  target.innerHTML = botThreadHtml(thread, issue);
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  bindBotButtons(issueNumber, issue);
}

function bindBotButtons(issueNumber, issue) {
  document.querySelector('#bot-ask').onclick = () => runBotAsk(issueNumber, issue);
  const assessButton = document.querySelector('#bot-assess');
  if (assessButton) assessButton.onclick = () => runBotAssess(issueNumber, issue);
}

async function runBotAsk(issueNumber, issue) {
  const button = document.querySelector('#bot-ask');
  button.disabled = true; button.textContent = 'Reading the code and writing the question…';
  try {
    const result = await request('/api/bot/ask', { repo: activeRepository, issueNumber });
    document.querySelector('#bot-thread').innerHTML = botThreadHtml(result, issue);
    bindBotButtons(issueNumber, issue);
    toast('Question posted to GitHub. Reply on the issue, then hit "Read replies & assess".');
    loadBotConsole();
  } catch (error) { toast(error.message); button.disabled = false; button.textContent = 'Ask on GitHub'; }
}

async function runBotAssess(issueNumber, issue) {
  const button = document.querySelector('#bot-assess');
  button.disabled = true; button.textContent = 'Reading the reply against the code…';
  try {
    const result = await request('/api/bot/assess', { repo: activeRepository, issueNumber });
    document.querySelector('#bot-thread').innerHTML = botThreadHtml(result, issue);
    bindBotButtons(issueNumber, issue);
    toast(result.verdict === 'no_reply_yet' ? 'No reply on the issue yet.' : `Assessed: ${result.verdict.replaceAll('_', ' ')}.`);
    loadBotConsole();
  } catch (error) { toast(error.message); button.disabled = false; button.textContent = 'Read replies & assess'; }
}

/* ================= shared: litmus strip + trust brief ================= */

function stripHtml(position, label) {
  return `<div class="soundness-strip"><div class="soundness-label">${label}</div><div class="strip"><span class="strip-marker" style="left:${position}%"></span></div><div class="strip-legend"><span>weak</span><span>needs review</span><span>strong</span></div></div>`;
}
const verdictPosition = { strong_signal: 88, needs_review: 50, weak_signal: 12 };
const soundnessPosition = { sound: 88, minor_gaps: 52, major_gaps: 14 };
const soundnessColor = { sound: 'teal', minor_gaps: 'amber', major_gaps: 'rose' };

function trustBriefHtml(brief) {
  const trail = brief.planningTrail || {};
  const trailClass = trail.respondedToFeedback ? 'strong' : trail.wentSilent || !trail.hasPlan ? 'warn' : '';
  const driftBlock = brief.drift?.checked && brief.drift.outOfScope.length
    ? `<div class="trail-note warn"><strong>Drift check:</strong> the diff touches files outside the agreed plan's scope.<ul class="drift-list">${brief.drift.outOfScope.map(file => `<li>${escapeHtml(file)}</li>`).join('')}</ul></div>`
    : brief.drift?.checked ? `<div class="trail-note strong"><strong>Drift check:</strong> the diff stays inside the scope the plan agreed on.</div>` : '';
  return `<article class="brief">
    <div class="brief-head">
      <div><div class="page-kicker">TRUST BRIEF · ${escapeHtml(brief.repo)} #${brief.number} · @${escapeHtml(brief.author || 'unknown')}</div><h2>${pretty(brief.verdict)}</h2></div>
      <span class="verdict-chip ${escapeHtml(brief.verdict)}">${pretty(brief.verdict)} · ${pretty(brief.alignment)}</span>
    </div>
    <div class="brief-strip"><div class="strip"><span class="strip-marker" style="left:${verdictPosition[brief.verdict] ?? 50}%"></span></div></div>
    <p>${escapeHtml(brief.summary)}</p>
    <div class="trail-note ${trailClass}"><strong>Planning trail:</strong> ${escapeHtml(trail.note || 'None recorded.')}${brief.trailAssessment ? ` ${escapeHtml(brief.trailAssessment)}` : ''}</div>
    ${driftBlock}
    <div class="brief-grid">
      <div><small>REVIEW FOCUS</small><b>${escapeHtml(brief.reviewFocus || '—')}</b></div>
      <div><small>RISK AREAS</small><b>${escapeHtml((brief.riskAreas || []).join(' · ') || 'No major risks surfaced')}</b></div>
      <div><small>STRUCTURAL RISK</small><b>${brief.structuralRisk ? `${brief.structuralRisk}/100 — touches a high-dependency module in repo memory` : 'Low — no retained high-risk module in the diff'}</b></div>
    </div>
    <div class="button-row"><a class="cta ghost" href="${escapeHtml(brief.url)}" target="_blank" rel="noreferrer">Open pull request ↗</a><span class="hint">Litmus ranks the reading. The merge decision stays yours.</span></div>
  </article>`;
}

/* ================= contributor: matching ================= */

function renderMatches(result) {
  const profile = result.profile;
  const matches = result.matches || [];
  const target = document.querySelector('#contributor-results');
  const profileCard = `<article class="skill-card"><div><small>EVIDENCE-BACKED SKILL MAP</small><h2>@${escapeHtml(profile.username)}</h2><p>${escapeHtml(profile.summary)}</p></div><div class="skill-tags">${(profile.skills || []).map(skill => `<span>${escapeHtml(skill)}</span>`).join('') || '<span>Public work analyzed</span>'}</div></article>`;
  if (!matches.length) {
    target.innerHTML = `${profileCard}<div class="empty-state"><h2>No suitable open issues right now.</h2><p>Litmus excluded assigned, claimed, and overcrowded candidates. GitHub search rotates quickly — try again in a minute.</p></div>`;
    return;
  }
  target.innerHTML = `${profileCard}
    <div class="section-head"><h2>Where your evidence lands best</h2><span>open · unassigned · under-served first</span></div>
    <div class="matches">${matches.map((match, index) => `
      <article class="match-card${match.invited ? ' invited' : ''}">
        <div class="match-top"><small>${escapeHtml(match.repo)} · ★${match.stars ?? '—'}</small><span class="match-score">${escapeHtml(match.score)}% fit</span></div>
        ${match.invited ? '<span class="invited-badge">MAINTAINER ASKED FOR HELP</span>' : ''}
        <h3>${escapeHtml(match.title)}</h3>
        <p>${escapeHtml((match.description || 'Open issue').slice(0, 180))}</p>
        <div class="match-why">${escapeHtml(match.why)}</div>
        <footer><a href="${escapeHtml(match.url)}" target="_blank" rel="noreferrer">View on GitHub ↗</a><button class="claim-button" data-match="${index}">Start contribution</button></footer>
      </article>`).join('')}</div>`;
  matches.forEach((match, index) => document.querySelector(`[data-match="${index}"]`).addEventListener('click', () => claimAndStart(match, profile.username)));
}

async function analyzeProfile() {
  const username = document.querySelector('#github-username').value.trim();
  if (!username) return toast('Enter a public GitHub username.');
  activeUsername = username.replace(/^@/, '');
  localStorage.setItem('litmus_username', activeUsername);
  const button = document.querySelector('#analyze-profile');
  button.disabled = true; button.textContent = 'Reading your GitHub…';
  document.querySelector('#match-loading').classList.add('active');
  document.querySelector('#contributor-results').innerHTML = '';
  try { renderMatches(await request('/api/contributor-match', { username: activeUsername })); }
  catch (error) { document.querySelector('#contributor-results').innerHTML = `<div class="empty-state"><h2>Matching is unavailable right now.</h2><p>${escapeHtml(error.message)}</p></div>`; }
  document.querySelector('#match-loading').classList.remove('active');
  button.disabled = false; button.textContent = 'Analyze my work';
}

async function claimAndStart(match, username) {
  try {
    await request('/api/claim-issue', { repo: match.repo, issueNumber: match.id, username, issueTitle: match.title, issueUrl: match.url });
    selectedMatch = match; orientation = null; planReview = null; prBrief = null; planDraft = ''; journeyStage = 0;
    document.querySelector('#journey-issue-id').textContent = `${match.repo} #${match.id}`;
    document.querySelector('#journey-title').innerHTML = `${escapeHtml(match.title)}`;
    document.querySelector('#journey-repo').textContent = `${match.repo} · with repository memory behind every step`;
    showView('journey-view');
    renderJourney();
  } catch (error) { toast(error.message); }
}

/* ================= contributor: journey ================= */

function setStep(stage) {
  document.querySelectorAll('#journey-steps .step').forEach(step => {
    const index = Number(step.dataset.step);
    step.classList.toggle('active', index === Math.min(stage, 3));
    step.classList.toggle('done', index < stage);
  });
}

async function renderJourney() {
  setStep(journeyStage);
  const target = document.querySelector('#journey-content');

  if (journeyStage === 0) {
    if (!orientation) {
      target.innerHTML = `<div class="match-loading active"><div class="loader"></div><span>Reading the issue, the implicated files, their callers, and the repo's conventions…</span></div>`;
      try { orientation = await request('/api/orient-issue', { repo: selectedMatch.repo, issueNumber: selectedMatch.id, username: activeUsername }); }
      catch (error) { target.innerHTML = `<div class="empty-state"><h2>We couldn't load this issue's context.</h2><p>${escapeHtml(error.message)}</p></div>`; return; }
    }
    const constraints = (orientation.constraints || []).map(constraint => `<div class="callout"><strong>${escapeHtml(constraint.title)}:</strong> ${escapeHtml(constraint.detail)}<span class="mono-note">${escapeHtml(constraint.evidence)}</span></div>`).join('');
    target.innerHTML = `<article class="journey-card">
      <h2>Your sixty-second orientation</h2>
      <p>${escapeHtml(orientation.walkthrough)}</p>
      <div class="context-grid">${(orientation.areas || []).map(area => `<div class="context-item"><span class="role-tag">${escapeHtml(area.role)}</span><small>${escapeHtml(area.path)}</small><p>${escapeHtml(area.note)}</p></div>`).join('')}</div>
      ${constraints || ''}
      <div class="trail-note"><strong>Suggested first step:</strong> ${escapeHtml(orientation.firstStep)}</div>
      <div class="button-row"><button class="cta" id="orientation-next">Write my approach →</button><span class="hint">Even if you stop here, you got a free tour of the codebase.</span></div>
    </article>`;
    document.querySelector('#orientation-next').onclick = () => { journeyStage = 1; renderJourney(); };

  } else if (journeyStage === 1) {
    const isRevision = Boolean(planReview);
    const previousPoints = isRevision && planReview.points?.length
      ? `<div class="callout"><strong>You're revising.</strong> Address these repository constraints in your new plan:${planReview.points.map(point => `<span class="mono-note">· ${escapeHtml(point.constraint)}</span>`).join('')}</div>`
      : '';
    target.innerHTML = `<article class="journey-card">
      <h2>${isRevision ? 'Revise your approach' : 'What is your intended approach?'}</h2>
      <p>${isRevision ? 'Litmus showed you what the codebase actually requires. Revising now — before code exists — is the strongest understanding signal a maintainer can see.' : "Describe the change you plan to make. Litmus checks it against the repository's real callers, tests, and conventions — never generic advice."}</p>
      ${previousPoints}
      <div class="plan-form"><label for="plan">YOUR CONTRIBUTION PLAN${isRevision ? ` — REVISION ${(planReview.revision || 1) + 1}` : ''}</label>
      <textarea id="plan" placeholder="Example: I'll trace the existing retry path in the API client, keep the public interface unchanged, and add a regression test for the reported failure.">${escapeHtml(planDraft)}</textarea>
      <div class="button-row"><button class="cta" id="review-plan">${isRevision ? 'Check my revision' : 'Check my plan'}</button><span class="hint">Checked against real file:line evidence in ${escapeHtml(selectedMatch.repo)}.</span></div></div>
    </article>`;
    document.querySelector('#review-plan').onclick = async () => {
      const plan = document.querySelector('#plan').value.trim();
      if (plan.length < 25) return toast('Add a little more detail about your intended approach.');
      planDraft = plan;
      const button = document.querySelector('#review-plan');
      button.disabled = true; button.textContent = 'Checking against the repository…';
      try {
        planReview = await request('/api/analyze-plan', { repo: selectedMatch.repo, issueNumber: selectedMatch.id, plan, username: activeUsername, tone: 'mentor' });
        journeyStage = 2; renderJourney();
      } catch (error) { toast(error.message); button.disabled = false; button.textContent = 'Check my plan'; }
    };

  } else if (journeyStage === 2) {
    const points = planReview.points || [];
    const soundness = planReview.plan_soundness;
    const revisionBadge = planReview.revisedAfterFeedback ? `<span class="chip teal revision-chip">REVISED AFTER FEEDBACK — STRONG SIGNAL</span>` : '';
    const feedback = points.length
      ? points.map(point => `<article class="analysis-point"><h3>${escapeHtml(point.constraint)}</h3><p>${escapeHtml(point.collision)} ${escapeHtml(point.consequence)}</p><div class="evidence">${point.evidence.map(item => `${escapeHtml(item.path)}:${item.line_start}–${item.line_end} (${escapeHtml(item.symbol)})`).join(' · ')}</div><div class="callout"><strong>Question for you:</strong> ${escapeHtml(point.prompt_to_contributor)}</div></article>`).join('')
      : `<article class="analysis-point"><h3 style="color:var(--teal)">PLAN ALIGNS WITH THE REPOSITORY</h3><p>${escapeHtml(planReview.what_they_got_right || 'No repository-specific collisions were found.')}</p></article>`;
    target.innerHTML = `<article class="journey-card">
      <h2>${points.length ? 'The repository pushed back' : 'Your plan holds up'}</h2>
      ${stripHtml(soundnessPosition[soundness] ?? 50, `PLAN SIGNAL: <span class="chip ${soundnessColor[soundness] || 'dim'}">${pretty(soundness)}</span> · REVISION ${planReview.revision || 1}${revisionBadge ? ' ' + revisionBadge : ''}`)}
      ${planReview.revision_note ? `<div class="trail-note strong"><strong>Revision check:</strong> ${escapeHtml(planReview.revision_note)}</div>` : ''}
      ${planReview.what_they_got_right && points.length ? `<div class="trail-note"><strong>What's sound:</strong> ${escapeHtml(planReview.what_they_got_right)}</div>` : ''}
      ${feedback}
      <div class="button-row">
        ${points.length ? `<button class="cta" id="revise-plan">Revise my approach</button>` : ''}
        <button class="cta ${points.length ? 'ghost' : ''}" id="pr-next">${points.length ? 'Proceed anyway — I can justify it' : 'Go build — then bring back the PR'}</button>
        <a class="hint" href="${escapeHtml(selectedMatch.url)}" target="_blank" rel="noreferrer">Open the issue ↗</a>
      </div>
    </article>`;
    const reviseButton = document.querySelector('#revise-plan');
    if (reviseButton) reviseButton.onclick = () => { journeyStage = 1; renderJourney(); };
    document.querySelector('#pr-next').onclick = () => { journeyStage = 3; renderJourney(); };

  } else {
    if (prBrief) { target.innerHTML = trustBriefHtml(prBrief); return; }
    target.innerHTML = `<article class="journey-card">
      <h2>Bring back the pull request</h2>
      <p>Build the change in your fork, open the PR on GitHub, then paste its URL. Litmus reads the diff against your agreed plan and the repo's memory, and produces the trust brief the maintainer will see.</p>
      <div class="plan-form"><label for="pr-url">PULL REQUEST URL</label><textarea id="pr-url" style="min-height:52px" placeholder="https://github.com/owner/repository/pull/123"></textarea>
      <div class="button-row"><button class="cta" id="analyze-pr">Create trust brief</button><span class="hint">Re-checked only if the diff drifts from the plan's scope.</span></div></div>
    </article>`;
    document.querySelector('#analyze-pr').onclick = async () => {
      const prUrl = document.querySelector('#pr-url').value.trim();
      const button = document.querySelector('#analyze-pr');
      button.disabled = true; button.textContent = 'Reading the pull request…';
      try {
        prBrief = await request('/api/analyze-pr', { prUrl, issue: { repo: selectedMatch.repo, number: selectedMatch.id, title: selectedMatch.title } });
        renderJourney();
      } catch (error) { toast(error.message); button.disabled = false; button.textContent = 'Create trust brief'; }
    };
  }
}

/* ================= contributor: trail ================= */

async function loadTrail() {
  const target = document.querySelector('#trail-content');
  if (!activeUsername) { target.innerHTML = `<div class="empty-state"><h2>No trail yet.</h2><p>Analyze your GitHub in Discover and start a contribution — every orientation, plan, and revision lands here.</p></div>`; return; }
  target.innerHTML = `<div class="match-loading active"><div class="loader"></div><span>Loading your contribution trail…</span></div>`;
  try {
    const { trail } = await apiCall(`/api/trail?username=${encodeURIComponent(activeUsername)}`, { method: 'GET' });
    if (!trail.length) { target.innerHTML = `<div class="empty-state"><h2>No trail yet for @${escapeHtml(activeUsername)}.</h2><p>Claim an issue in Discover and write an approach — the planning evidence you build here travels with your PRs.</p></div>`; return; }
    target.innerHTML = trail.map(entry => `
      <article class="trail-card${entry.verdict ? ` verdict-${escapeHtml(entry.verdict)}` : ''}">
        <small>${escapeHtml(entry.repo)} #${entry.issueNumber} · ${pretty(entry.state)}</small>
        <h3>${escapeHtml(entry.issueTitle)}</h3>
        ${entry.briefSummary ? `<p style="margin:0;color:var(--muted);font-size:11px;line-height:1.6">${escapeHtml(entry.briefSummary)}</p>` : ''}
        <div class="trail-badges">
          ${entry.revisions ? `<span class="chip purple">${entry.revisions} plan ${entry.revisions === 1 ? 'submission' : 'submissions'}</span>` : '<span class="chip dim">no plan yet</span>'}
          ${entry.respondedToFeedback ? '<span class="chip teal">revised after feedback</span>' : ''}
          ${entry.finalSoundness ? `<span class="chip ${soundnessColor[entry.finalSoundness] || 'dim'}">plan: ${pretty(entry.finalSoundness)}</span>` : ''}
          ${entry.verdict ? `<span class="chip ${entry.verdict === 'strong_signal' ? 'teal' : entry.verdict === 'needs_review' ? 'amber' : 'rose'}">PR: ${pretty(entry.verdict)}</span>` : ''}
        </div>
        <div class="button-row" style="margin-top:10px"><a href="${escapeHtml(entry.issueUrl)}" target="_blank" rel="noreferrer">Issue ↗</a>${entry.prUrl ? `&nbsp;&nbsp;<a href="${escapeHtml(entry.prUrl)}" target="_blank" rel="noreferrer">Pull request ↗</a>` : ''}</div>
      </article>`).join('');
  } catch (error) { target.innerHTML = `<div class="empty-state"><h2>Trail unavailable.</h2><p>${escapeHtml(error.message)}</p></div>`; }
}

/* ================= maintainer: repositories ================= */

async function loadRegisteredRepos() {
  const target = document.querySelector('#registered-repos');
  try {
    const { repos } = await apiCall('/api/registered-repos', { method: 'GET' });
    if (!repos.length) { target.innerHTML = ''; return; }
    target.innerHTML = `<div class="section-head"><h2>Connected repositories</h2><span>surfaced first to matched contributors</span></div>` + repos.map(entry => `
      <div class="repo-row">
        <div><h3>${escapeHtml(entry.repo)}</h3><p>${entry.memory ? `${entry.memory.moduleCount} modules · ${entry.memory.dependencyEdges} dependency edges · ${entry.memory.testFiles.length} tests indexed` : 'memory pending'} · registered ${new Date(entry.registeredAt).toLocaleDateString()}</p></div>
        <button class="cta ghost" data-use-repo="${escapeHtml(entry.repo)}">Use in queue</button>
      </div>`).join('');
    target.querySelectorAll('[data-use-repo]').forEach(button => button.addEventListener('click', () => {
      activeRepository = button.dataset.useRepo;
      localStorage.setItem('litmus_repo', activeRepository);
      document.querySelector('#focus-repo-label').textContent = `Prioritizing ${activeRepository}`;
      switchMaintainerTab('priority');
      toast(`Queue pointed at ${activeRepository}. Describe your focus and build it.`);
    }));
  } catch { target.innerHTML = ''; }
}

async function registerRepository() {
  const repo = document.querySelector('#maintainer-repo').value.trim();
  if (!repo) return toast('Enter a repository in owner/name form.');
  const button = document.querySelector('#activate-repo');
  button.disabled = true; button.textContent = 'Building repo memory…';
  try {
    const result = await request('/api/register-repo', { repo, mode: 'mentor' });
    activeRepository = result.repo;
    localStorage.setItem('litmus_repo', activeRepository);
    document.querySelector('#focus-repo-label').textContent = `Prioritizing ${activeRepository} · ${result.memory.moduleCount} modules remembered`;
    loadRegisteredRepos();
    switchMaintainerTab('priority');
    toast(result.refreshed ? 'Repository memory built. Its issues now surface to matched contributors.' : 'Repository memory is already current.');
  } catch (error) { toast(error.message); }
  button.disabled = false; button.textContent = 'Connect repository';
}

/* ================= maintainer: priority queue ================= */

function graphSvg(graph) {
  const nodes = graph.nodes || [];
  if (nodes.length < 3) return '';
  const width = 860, height = 340, cx = width / 2, cy = height / 2;
  const positions = new Map();
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
    const radiusX = 350 - (node.risk > 55 ? 110 : 0);
    const radiusY = 135 - (node.risk > 55 ? 55 : 0);
    positions.set(node.path, { x: cx + Math.cos(angle) * radiusX, y: cy + Math.sin(angle) * radiusY });
  });
  const edgeLines = (graph.edges || []).map(edge => {
    const from = positions.get(edge.from), to = positions.get(edge.to);
    return from && to ? `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" />` : '';
  }).join('');
  const topRisk = [...nodes].sort((a, b) => b.risk - a.risk).slice(0, 10).map(node => node.path);
  const nodeCircles = nodes.map(node => {
    const { x, y } = positions.get(node.path);
    const radius = 4 + Math.min(9, node.risk / 12);
    const color = node.isTest ? '#52d6b4' : node.risk >= 55 ? '#f07a90' : node.risk >= 30 ? '#efb35f' : '#b3a1f7';
    const label = topRisk.includes(node.path) ? `<text x="${(x + radius + 4).toFixed(1)}" y="${(y + 3).toFixed(1)}">${escapeHtml(node.path.split('/').pop())}</text>` : '';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}"><title>${escapeHtml(node.path)} · risk ${node.risk} · ${node.dependents} dependents</title></circle>${label}`;
  }).join('');
  return `<svg class="graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Repository dependency graph">${edgeLines}${nodeCircles}</svg>`;
}

function renderPriorityWorkspace(data) {
  const workspace = document.querySelector('#priority-workspace');
  const memory = data.memory || {};
  const trailChips = pr => {
    const trail = pr.planningTrail;
    const chips = [];
    if (trail?.respondedToFeedback) chips.push('<span class="chip teal">revised after feedback</span>');
    else if (trail?.wentSilent) chips.push('<span class="chip rose">went silent after questions</span>');
    else if (trail?.hasPlan) chips.push(`<span class="chip purple">planned via Litmus</span>`);
    if (pr.structuralRisk >= 40) chips.push(`<span class="chip amber">high-risk module · ${pr.structuralRisk}</span>`);
    if (pr.crossPrCollision) chips.push('<span class="chip rose">collision risk</span>');
    if (pr.draft) chips.push('<span class="chip dim">draft</span>');
    return chips.length ? `<div class="row-chips">${chips.join('')}</div>` : '';
  };
  const issueRows = data.issues.length ? data.issues.map(issue => `
    <article class="priority-row"><span class="priority-number">${issue.priority}</span>
      <div><h3>#${issue.number} · ${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.why)}</p>
      ${issue.structuralRisk >= 40 ? `<div class="row-chips"><span class="chip amber">touches high-dependency code</span></div>` : ''}
      <a href="${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">Open issue ↗</a></div>
    </article>`).join('') : '<p class="hint">No open issues matched this focus.</p>';
  const prRows = data.pullRequests.length ? data.pullRequests.map(pr => `
    <article class="priority-row"><span class="priority-number">${pr.priority}</span>
      <div style="width:100%"><h3>PR #${pr.number} · ${escapeHtml(pr.title)}</h3><p>${escapeHtml(pr.why)}</p>
      ${trailChips(pr)}
      <a href="${escapeHtml(pr.url)}" target="_blank" rel="noreferrer">Open PR ↗</a> &nbsp;
      <a href="#" data-brief-pr="${escapeHtml(pr.url)}">Trust brief →</a>
      <div class="brief-inline" id="brief-inline-${pr.number}"></div></div>
    </article>`).join('') : '<p class="hint">No open pull requests matched this focus.</p>';
  const memoryCard = memory.moduleCount ? `
    <section class="memory-card"><div><small>REPO MEMORY · REVISION ${escapeHtml(String(memory.revision || '').slice(0, 7))}</small>
      <h2>${memory.moduleCount} modules · ${memory.dependencyEdges} dependency edges remembered</h2>
      <p>Indexed ${escapeHtml(new Date(memory.indexedAt).toLocaleString())}. Every ranking below runs against this map — the way a maintainer who's worked here for years would read it, not a stranger seeing it cold.</p></div>
      <div class="memory-metrics"><span>${memory.testFiles?.length || 0}<b>tests</b></span><span>${memory.highRiskModules?.length || 0}<b>risk areas</b></span><span>${memory.constraints?.length || 0}<b>constraints</b></span></div>
    </section>` : '';
  const collisions = (data.crossPrRisks || []).length ? `
    <section class="collision-card"><small>CROSS-PR AWARENESS</small><h2>In-flight changes heading for a collision</h2>
      ${data.crossPrRisks.map(risk => `<p><strong>PR #${risk.pullRequests.join(' + PR #')}</strong> — ${escapeHtml(risk.message)}</p>`).join('')}
    </section>` : '';
  workspace.innerHTML = `${memoryCard}
    <div class="priority-brief"><strong>Priority brief:</strong> ${escapeHtml(data.brief)}</div>
    <div class="priority-columns">
      <section class="priority-section"><h2>Issues to move first</h2>${issueRows}</section>
      <section class="priority-section"><h2>PRs to review first</h2>${prRows}</section>
    </div>
    ${collisions}
    <section class="graph-card" id="graph-card"><small>KNOWLEDGE GRAPH</small><h2>The map Litmus reads before it ranks</h2><p>Module dependency graph from repo memory. Size and color = structural risk (rose = high-dependency, teal = tests). Hover any node.</p><div id="graph-target"><div class="match-loading active"><div class="loader"></div><span>Rendering dependency graph…</span></div></div></section>`;
  workspace.querySelectorAll('[data-brief-pr]').forEach(link => link.addEventListener('click', async event => {
    event.preventDefault();
    const prUrl = link.dataset.briefPr;
    const container = link.parentElement.querySelector('.brief-inline');
    container.innerHTML = `<div class="match-loading active"><div class="loader"></div><span>Building trust brief…</span></div>`;
    try { container.innerHTML = trustBriefHtml(await request('/api/analyze-pr', { prUrl })); }
    catch (error) { container.innerHTML = `<p class="hint">${escapeHtml(error.message)}</p>`; }
  }));
  apiCall(`/api/repo-graph?repo=${encodeURIComponent(data.repo)}`, { method: 'GET' })
    .then(result => { document.querySelector('#graph-target').innerHTML = graphSvg(result.graph) || '<p class="hint">Not enough indexed dependency edges to draw a graph for this repository.</p>'; })
    .catch(() => { document.querySelector('#graph-target').innerHTML = '<p class="hint">Graph unavailable.</p>'; });
}

async function buildPriorityQueue() {
  if (!activeRepository) { switchMaintainerTab('repos'); return toast('Connect a repository first.'); }
  const focus = document.querySelector('#maintainer-focus').value.trim();
  const button = document.querySelector('#build-priority');
  button.disabled = true; button.textContent = 'Reading the repository…';
  document.querySelector('#priority-workspace').innerHTML = `<div class="match-loading active"><div class="loader"></div><span>Reading open issues and PRs, weighing structural risk and planning trails against your intent…</span></div>`;
  try { renderPriorityWorkspace(await request('/api/maintainer-priority', { repo: activeRepository, focus })); }
  catch (error) { document.querySelector('#priority-workspace').innerHTML = `<div class="empty-state"><h2>Priority queue unavailable.</h2><p>${escapeHtml(error.message)}</p></div>`; }
  button.disabled = false; button.textContent = 'Build priority queue';
}

/* ================= maintainer: standalone triage ================= */

async function triagePullRequest() {
  const prUrl = document.querySelector('#triage-pr-url').value.trim();
  const button = document.querySelector('#triage-pr');
  const target = document.querySelector('#triage-result');
  button.disabled = true; button.textContent = 'Reading the pull request…';
  target.innerHTML = `<div class="match-loading active"><div class="loader"></div><span>Reading the diff, repo memory, and any planning trail…</span></div>`;
  try { target.innerHTML = trustBriefHtml(await request('/api/analyze-pr', { prUrl })); }
  catch (error) { target.innerHTML = `<div class="empty-state"><h2>Couldn't build the brief.</h2><p>${escapeHtml(error.message)}</p></div>`; }
  button.disabled = false; button.textContent = 'Create trust brief';
}

/* ================= wiring ================= */

document.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => enterRole(button.dataset.role)));
document.querySelectorAll('[data-contributor-tab]').forEach(button => button.addEventListener('click', () => switchContributorTab(button.dataset.contributorTab)));
document.querySelectorAll('[data-maintainer-tab]').forEach(button => button.addEventListener('click', () => switchMaintainerTab(button.dataset.maintainerTab)));
document.querySelector('#analyze-profile').addEventListener('click', analyzeProfile);
document.querySelector('#github-username').addEventListener('keydown', event => { if (event.key === 'Enter') analyzeProfile(); });
document.querySelector('#back-to-contributor').addEventListener('click', () => enterRole('contributor'));
document.querySelector('#home-button').addEventListener('click', () => showView('welcome-view'));
document.querySelector('#activate-repo').addEventListener('click', registerRepository);
document.querySelector('#maintainer-repo').addEventListener('keydown', event => { if (event.key === 'Enter') registerRepository(); });
document.querySelector('#build-priority').addEventListener('click', buildPriorityQueue);
document.querySelector('#triage-pr').addEventListener('click', triagePullRequest);
document.querySelector('#bot-toggle').addEventListener('click', async () => {
  if (!activeRepository) { switchMaintainerTab('repos'); return toast('Connect a repository first.'); }
  const toggle = document.querySelector('#bot-toggle');
  const next = !toggle.classList.contains('on');
  renderBotToggle(next);
  try {
    await request('/api/repo-settings', { repo: activeRepository, enabled: next });
    toast(next ? `Litmus bot is on for ${activeRepository}. It will answer volunteers on your issues.` : 'Litmus bot is off.');
  } catch (error) { renderBotToggle(!next); toast(error.message); }
});

// Deep links: #maintainer/bot, #contributor/trail, plus ?repo=owner/name&user=login to preset context.
const params = new URLSearchParams(window.location.search);
if (params.get('repo')) { activeRepository = params.get('repo'); localStorage.setItem('litmus_repo', activeRepository); }
if (params.get('user')) { activeUsername = params.get('user'); localStorage.setItem('litmus_username', activeUsername); }
const [hashRole, hashTab] = window.location.hash.replace('#', '').split('/');
if (['contributor', 'maintainer'].includes(hashRole)) {
  enterRole(hashRole);
  if (hashTab) (hashRole === 'maintainer' ? switchMaintainerTab : switchContributorTab)(hashTab);
}
if (activeUsername) document.querySelector('#github-username').value = activeUsername;
if (activeRepository) document.querySelector('#focus-repo-label').textContent = `Prioritizing ${activeRepository}`;

apiCall('/api/health', { method: 'GET' })
  .then(status => { document.querySelector('#runtime-state').textContent = status.mode === 'live' ? 'GPT-5.6 LIVE' : 'CONFIGURATION REQUIRED'; })
  .catch(() => { document.querySelector('#runtime-state').textContent = 'API OFFLINE'; });
