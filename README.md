<div align="center">

# 🧪 Litmus

### The test happens before the code.

**Litmus is a two sided platform that gets the right contributor to the right open source issue, helps them get it right before they write code, and hands maintainers a trust signal and a smart queue so they stop drowning in review.**

[**Live app**](https://litmus-822987556610.us-central1.run.app) · [Demo repository](https://github.com/Vidhaankhare16/Google-Gen-AI/issues) · Built with Codex, powered by GPT 5.6

</div>

---

## The problem

Open source is in crisis from two directions at once.

On one side, popular repositories are flooded with low quality, often AI generated contributions that submitters cannot explain when questioned. Curl killed its six year bug bounty program over exactly this. The Jazzband Python collective shut down entirely. Forty five percent of maintainers now name burnout as their single biggest challenge.

On the other side, small repositories starve. Good contributors cannot find them, and contributing feels intimidating. Onboarding is consistently the number one maintainer pain point.

Every existing bot screens finished code. By then the wasted work has already happened. Nothing on GitHub fixes the problem where it actually starts, which is matching the right person to the right issue, and getting the approach right before any code exists.

Litmus does both.

---

## How Codex and GPT 5.6 were used

This is the uncommon submission where the capability being judged is also the product's core engine. GPT 5.6 is not a feature bolted onto Litmus. It **is** Litmus. Remove it and there is no product left, only a static dashboard.

### GPT 5.6 runs the product

Seven distinct reasoning tasks in the running application are GPT 5.6 calls. Every one uses the Responses API with a strict JSON schema, so verdicts come back as enums and a malformed response fails loudly instead of rendering as garbage.

| Product capability | What GPT 5.6 actually does | Where |
|---|---|---|
| **Contributor matching** | Reads real repository evidence (languages by bytes, topics, recency) and ranks live GitHub issues against it, citing which specific project makes each match plausible | `contributorMatch()` |
| **Repository orientation** | Turns the retrieved code slice into a sixty second tour, naming the non obvious constraints a newcomer would trip over | `orientIssue()` |
| **Plan collision analysis** | Compares a stated approach against real callers, tests and conventions, and must cite path, symbol and line range for every finding | `analyzePlan()` |
| **Revision judgement** | Receives the previous plan and previous findings, and decides whether each earlier point is now resolved, partly resolved or ignored | `analyzePlan()` |
| **The bot's screening question** | Reads the code an issue touches and produces one question only somebody who opened the file could answer | `botAsk()` |
| **Answer assessment** | Judges a contributor's reply against the actual code and returns a verdict | `botAssess()` |
| **Trust brief and priority ranking** | Weighs diff, planning trail, drift check and structural risk into one verdict, and rebuilds the maintainer queue around plain language intent | `analyzePullRequest()`, `priorityWorkspace()` |

Three of GPT 5.6's headline capabilities are doing load bearing work here:

**Code review reasoning.** The plan checker found a deadlock nobody told it about. Given a request to add an eviction policy, it worked out that the storage class is guarded by a non reentrant `threading.Lock`, that the obvious implementation would call a method acquiring that same lock, and that the first upload hitting the ceiling would freeze the entire service. It cited three separate line ranges across two files. That is the product's central promise, and it is GPT 5.6 doing it.

**Large context.** Repo memory feeds up to fifty six indexed files, a dependency graph neighbourhood, constraint signals and conventions into a single call, so the model reasons about the project rather than the diff.

**Multi repository understanding.** The same reasoning runs across any public repository on GitHub, cold, with no per repository configuration.

### Codex built it

The entire codebase was written with Codex, which is the honest and slightly recursive part of this submission: an AI coding tool was used to build the tool that helps people contribute well with AI coding tools.

Codex did the work you would expect (the zero dependency HTTP server, the dependency graph resolver for the JavaScript, TypeScript and Python module systems, the whole frontend and its design system), but the parts where it mattered most were the fiddly ones. The GitHub App authentication path, where a short lived RS256 JWT is signed with Node's built in crypto and exchanged for a cached installation token, was written and debugged with Codex without pulling in a JWT library. So was the import resolution logic that turns raw specifiers into real graph edges.

It also caught things. Reading raw API output surfaced a scoring bug where the priority queue was returning positions like 1, 2, 3, 4 instead of using the 0 to 100 scale. The ordering looked right, so it survived a casual glance, but the numbers carried no information.

Litmus does not argue that AI assistance is the problem. It was built with AI assistance. It argues that **not understanding your own contribution** is the problem, and those are very different things. That is why Litmus never attempts to detect AI authorship. It asks one question and listens to the answer.

## What Litmus does

### For contributors

You sign in and connect your GitHub. Litmus reads your real work, the languages and domains where your strongest projects actually live, and matches you to issues you are genuinely equipped to solve. It deliberately steers toward unclaimed issues in under served repositories instead of the crowded popular ones, so effort flows where it is actually needed.

Once you pick up an issue, Litmus reads the relevant slice of the repository. The implicated files, their callers and callees, the tests, the conventions, and the non obvious constraints that trip people up. Then it gives you a sixty second orientation on what you are walking into. Even if you never submit a line, you still got a free tour of the codebase.

Then you state your intended approach, and this is the heart of the whole product. Litmus checks that plan against the actual code and surfaces the specific collisions a naive plan would miss. Never generic advice like "consider edge cases", always tied to a real function in this repository.

Here is a real example from the demo repo. A contributor proposes calling `delete_document()` to evict the oldest entry when storage hits its cap. Reasonable sounding, and completely wrong:

> **Constraint:** `DocumentStorage` uses a non reentrant `threading.Lock`, and `delete_document()` acquires that same lock.
>
> **Collision:** The planned `store_document()` flow would run inside its existing `with self._lock:` section and call `self.delete_document(oldest_id)`, which attempts to acquire `_lock` again on the same thread.
>
> **Consequence:** The first upload that reaches the ceiling will deadlock, and hold the lock indefinitely, blocking retrieval, updates, stats, and the cleanup worker.
>
> **Evidence:** `backend/services/document_storage.py:13-19`, `:21-46`, `:87-102`

How you respond is the test the tool is named for. Revising your plan when shown a constraint is the strongest possible sign you understand what you are doing, and Litmus captures that before a single line of code is written. Acknowledging a constraint with a sound justification is just as strong. Going silent is a warning.

### For maintainers

You list your repository as open to genuine contributors. From that moment Litmus works your side of the problem. It reads the repo, ranks your open issues and PRs by real priority, surfaces which incoming contributions deserve attention first, and gives you a dashboard where signal rises instead of getting buried.

You can also steer it in plain language. Tell Litmus "I am focused on the auth refactor" or "prioritize anything touching the public API" or "surface first time friendly issues for new contributors", and it rebuilds the entire queue around that intent. This is the shift from AI outputs to AI outcomes: you direct an agent toward the result you want, instead of reading a static sort.

Here is the queue from the demo repository, with the focus set to backend storage stability:

| Priority | Issue | Why |
|---|---|---|
| **94** | Cap in memory documents and evict oldest | Matches the stated focus, touches a high dependency module with a locking constraint |
| **68** | Upload progress bar stalls at 82% | Bounded frontend bug, labeled good first issue, right size for a newcomer |
| **8** | 🚀 "I can OPTIMIZE your ENTIRE codebase with AI" | Cannot point to a single line of this codebase, no acceptance criteria, no scope |

That last row matters. Litmus never guessed whether a human or a model wrote it. It ranked it last because the request could not explain itself against the actual repository. That distinction is the entire ethical spine of this project.

### The Litmus bot

Flip the bot on and Litmus works your issue tracker directly, where contributors already are. When someone volunteers, it reads the code that issue actually touches and asks one question, the kind only somebody who opened the file can answer:

> Since `DocumentStorage` uses a non reentrant `threading.Lock`, how will you keep the limit check, oldest document eviction, insertion, and eviction counter update protected from the cleanup thread without having an eviction helper try to acquire the same lock again?

Then it reads the reply against the real code and returns one of three verdicts. `demonstrated_understanding` when the answer engages with the actual constraint, or adjusts after being shown it. `partial` when it engaged genuinely but hand waved the core issue. `non_responsive` when confident sounding text never touches the specific code. That verdict joins the contributor's trail and shows up later in the trust brief on their pull request.

### The trust brief

When the PR arrives, Litmus stays out of the way unless the diff drifts from the agreed plan. Then it produces a compact brief: what the change does in two sentences, the planning trail (did they revise when corrected? justify going their own way?), a drift check against the scope the plan implied, risk areas, and one sortable verdict of `strong_signal`, `needs_review`, or `weak_signal`.

The maintainer still decides everything. Litmus just turns "read everything cold and exhausted" into "read the card, dig into the flagged parts".

## Repo memory, and why it matters

Most bots read a repository cold every time they act. They see a pull request, not the project it lives in.

Litmus builds and stores a durable map of each repository the first time it is connected: modules, dependency edges, tests, conventions, and constraint signals, keyed to the branch revision so it refreshes only when the branch actually moves. Every plan check and every trust brief runs against that memory, the way a maintainer who has worked on the project for years would read it, rather than the way a stranger seeing it for the first time does.

That memory unlocks two things a stateless per PR bot simply cannot do.

**Cross PR awareness.** Because Litmus holds the whole repository in view, it sees when two open PRs are touching the same fragile module and warns before they collide. On a real test repository it surfaced six live collisions, including five separate PRs all modifying `client.ts`.

**Trustworthy ranking.** Priority is computed from real structural risk rather than surface labels. Each indexed module gets a score:

$$R_f = \min\left(100,\ 8 d_f + 12 s_f + 12 \cdot \mathbb{1}[\text{core}] + 12 \cdot \mathbb{1}[\text{convention}] + 4 \cdot \mathbb{1}[\text{test}]\right)$$

where $d_f$ is how many indexed modules import $f$, and $s_f$ is the count of detected constraint signals inside it, things like lock discipline, shutdown paths, transaction boundaries, and public API surfaces. A file that half the codebase depends on and that manages a lock scores high, and changes touching it get earlier eyes. The dependency graph behind this is rendered live in the maintainer dashboard.

---

## Inspiration

I kept reading the same story from two completely different kinds of maintainer.

The maintainers of large projects were exhausted. Curl shutting down a six year old bug bounty program because the noise had overwhelmed the signal was the moment it clicked for me. These are not people who lack tooling. They have CI, linters, review bots, static analysis, and every one of those tools looks at code that has already been written. The waste has already happened by the time any of them speak.

At the same time I saw the opposite problem up close. Small repositories with genuinely interesting work and zero contributors, and people who wanted to contribute but had no idea where to start or whether they would be welcome.

What struck me is that these are the same problem viewed from two ends. Effort in open source is distributed terribly. It piles onto a handful of famous repositories, mostly from people who cannot explain what they submitted, while thousands of projects that would love help get none.

Then I thought about what actually separates a real contributor from noise, and it is not the code. It is whether the person can explain the approach when you push back. A maintainer figures this out in one comment. That is a conversation, and conversations are exactly what a model with real code reasoning can now have. So I built the thing that has that conversation before the code exists instead of after.

## What I learned

**Specificity is a design constraint, not a prompt tweak.** My first plan checker produced confident, useless output. "Consider thread safety." "Make sure to add tests." Advice that could apply to any repository is worse than silence because it teaches contributors to ignore the tool. The fix was a hard rule enforced in the system prompt and the schema together: every point must depend on a fact visible only in the provided repository context, and must cite a path, a symbol, and a line range. If it cannot cite, it does not ship. Requiring the citation is what forced the specificity, not asking for it politely.

**Never build an AI detector.** This was the most important call I made. It would have been easy to add a "this looks AI generated" score, and it would have been both unreliable and unfair, since plenty of excellent contributors use AI tools well. So Litmus judges exactly one thing: can this work explain itself against this codebase? A great contributor using Codex passes easily. Someone who pasted a diff they do not understand fails at the first question. The signal turns out to be sharper than authorship detection would ever have been, and it does not require accusing anybody of anything.

**Retrieval beats context size.** The million token window is genuinely useful, but dumping an entire repository into it produced worse results than selecting sixteen files well. The dependency graph is what made the selection good. Knowing which modules import the file an issue touches meant the model saw callers, not just the file itself, and callers are where collisions actually live.

**Schemas are how you make a model behave.** Every model output in Litmus is a strict JSON schema with enums for verdicts. That single decision removed almost all output variance, made the UI trivial to write against, and meant a bad response fails loudly instead of rendering as garbage.

## How I built it

The whole thing is deliberately small: a zero dependency Node server and a vanilla JavaScript frontend. No framework, no build step, no `node_modules` at all. `node server.js` and it runs. For a hackathon that meant every minute went into product logic rather than tooling, and the container image builds in seconds.

**The engine is GPT 5.6** doing the actual product work rather than just helping me write it. It handles contributor matching, orientation, plan collision analysis, the bot's screening question and its assessment, the trust brief, and intent driven ranking. Every call goes through the Responses API with a strict JSON schema.

**Repo memory** is built by walking the git tree through the GitHub API, selecting up to fifty six of the most structurally interesting files, resolving import statements into a real dependency graph, scanning for constraint signals with targeted patterns, and scoring structural risk with the formula above. It is cached against the branch SHA, so the expensive pass happens once and every later action is fast.

**The planning trail** is what makes the whole loop work. Each plan submission is appended to the issue claim with its soundness, the points raised, and the evidence paths cited. When a pull request appears, Litmus recovers that trail, checks the diff scope against the files the plan implied, and hands the maintainer both the change and the story of how it was arrived at.

**The bot** authenticates as a GitHub App by signing a short lived RS256 JWT with Node's built in crypto, exchanging it for a cached installation token, so its comments carry their own identity. If the App is not configured it falls back to a personal token and says so in the UI, rather than failing.

**Deployment** is a single container on Cloud Run.

I built Litmus with Codex, which I think is the honest and slightly recursive part of this submission. I used an AI coding tool to build the tool that helps people contribute well with AI coding tools. The product does not argue that AI assistance is the problem. It argues that not understanding your own contribution is the problem, and those are very different things.

## Challenges I faced

**Getting the model to shut up.** The hardest problem by far was not making it find issues, it was making it stay silent when a plan was actually fine. An early version flagged something on every single submission, because a model asked to review will review. A tool that always objects trains people to stop reading it. I fixed this by making zero points an explicitly valid and encouraged outcome, and by requiring line level evidence for every claim, which made unfounded objections impossible to express in the schema.

**Judging a revision instead of re-judging a plan.** When somebody revises after feedback, checking the new plan from scratch loses the entire point, because the interesting information is whether the revision addressed what was raised. I had to pass the previous plan and the previous points back in and ask specifically whether each earlier point is now resolved, partly resolved, or ignored. That comparison is what turns a plan checker into a trust signal.

**The demo would not fit in three minutes.** Every GPT call takes between forty and a hundred and twenty seconds against a real repository. That is completely fine for the actual product, where a contributor spends a minute waiting and saves a day of wasted work, but it is brutal for a demo video. I ended up caching aggressively wherever the data allowed it and recording in segments.

**Making a public deployment safe.** The moment Litmus is public it shares one GitHub token with every visitor, which means a stranger could use it to post comments as me on any repository my token can write to. I added a write allowlist so the deployed instance can only comment on the demo repository, and everything else stays read only. Running it locally with your own credentials removes the restriction.

**Rate limits shaped the matching design.** GitHub's search API is strict, and the naive approach of one search plus a metadata call per candidate hit limits immediately. Matching now runs a small number of language targeted searches in parallel, deduplicates, caps candidates per repository so one project cannot flood the shortlist, and degrades to heuristic scoring if the model is unavailable rather than failing outright.

## What is next

Persistent storage so repo memory survives across instances, a hosted GitHub App anyone can install in one click, and letting maintainers tune the strictness of the screening question per repository.

---

## Run it yourself

```bash
git clone https://github.com/Vidhaankhare16/litmus.git
cd litmus
cp .env.example .env    # add your own keys
node server.js
```

Open `http://localhost:4173`. There is nothing to install.

| Variable | Needed for |
|---|---|
| `OPENAI_API_KEY` | All model reasoning. Required. |
| `OPENAI_MODEL` | Defaults to `gpt-5.6` |
| `GITHUB_TOKEN` | Reading repositories and posting bot comments |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH` | Optional. Gives the bot its own `Litmus[bot]` identity |
| `LITMUS_WRITE_ALLOWLIST` | Optional. Restricts which repos the bot may comment on |
| `GITHUB_WEBHOOK_SECRET` | Optional. Fully automatic webhook mode |

### API

| Route | Purpose |
|---|---|
| `POST /api/contributor-match` | Evidence based issue matching |
| `POST /api/orient-issue` | Repository orientation before coding |
| `POST /api/analyze-plan` | Plan collision check, records the trail |
| `POST /api/analyze-pr` | Trust brief with drift check and verdict |
| `POST /api/register-repo` | Build and store repo memory |
| `POST /api/maintainer-priority` | Intent driven priority queue |
| `POST /api/bot/ask`, `POST /api/bot/assess` | The bot loop |
| `GET /api/repo-graph` | Dependency graph for visualisation |
| `GET /api/trail` | A contributor's planning history |
| `POST /webhooks/github` | Automatic mode |

---

<div align="center">

**Litmus never claims to detect AI. It asks one question, and listens to the answer.**

</div>
