# Team Workflow — Planning, Execution & Delivery

> This document governs how every feature, fix, and improvement is planned, built, reviewed,
> and shipped. All agents operate under this workflow. Ariel is the sole merge authority.

---

## The Team

| Agent | Role | Voting Weight |
|---|---|---|
| **Architect** | System design, patterns, PR final gate | **3 votes** (counts as 3 agents) |
| **PM** | UX, scope, user perspective, acceptance criteria | 1 vote |
| **Backend** | API, services, business logic | 1 vote |
| **Frontend** | Angular, UI, components | 1 vote |
| **DevOps** | Infrastructure, CI/CD, K8s | 1 vote |
| **Tester** | Test strategy, quality gate | 1 vote |
| **Security** | Defensive security, threat review | 1 vote |
| **Pentester** | Offensive review, attack surface | 1 vote |
| **DB Expert** | Schema, queries, migrations | 1 vote |
| **Tech Writer** | Documentation | 1 vote |
| **Code Reviewer** | Line-level code quality | 1 vote |
| **Data Engineer** | Observability, pipelines, dashboards | 1 vote |
| **SRE** | Reliability, SLOs, production readiness | 1 vote |
| **ML/AI Engineer** | AI features, prompt optimization | 1 vote |

---

## Voting System

When agents disagree on an approach, a vote is called.

**Threshold to proceed: 5 effective votes**
- Architect approval = 3 votes
- Each other agent = 1 vote
- A vote of 5+ → proceed with that solution
- A vote below 5 on all options → **escalate to Ariel to decide**

**Architect veto:** The Architect may veto any decision that violates core architectural principles, regardless of vote count. A veto must be explained with specific technical reasoning. A veto can be overridden only by Ariel.

**Which agents vote on what:**

| Decision type | Agents who vote |
|---|---|
| Architecture / system design | Architect, Backend, Frontend, DevOps, SRE, DB Expert |
| Feature scope / UX | PM, Frontend, Backend, Architect |
| Tech stack choice | Architect, Backend, Frontend, DevOps |
| Security approach | Security, Pentester, Architect, Backend |
| Data / observability | Data Engineer, SRE, Backend, DevOps |
| Test strategy | Tester, Backend, Frontend, Architect |
| DB schema | DB Expert, Backend, Architect |

---

## Sprint Structure

- **Duration:** 2 weeks fixed
- **Early finish:** A sprint can close early if all tasks are Done and all regression checks pass
- **Ceremonies:**
  - Sprint start: planning session (this workflow, Phase 3)
  - Mid-sprint: brief sync — any blockers, any regressions?
  - Sprint end: review + retrospective + regression sweep

### Task States

```
Backlog → Sprint Planned → In Progress → In Review → PR Ready → Merged → Done
```

### Priority Levels

| Priority | Definition | Behavior |
|---|---|---|
| 🔴 Critical | Production broken, regression found by Tester | Inserted into current sprint immediately, top of queue |
| 🟠 High | Significant bug, SLO at risk, security finding | Next available slot in current sprint |
| 🟡 Medium | Feature work, improvements | Normal sprint planning |
| 🔵 Low | Nice-to-have, tech debt, docs | Backlog until capacity allows |

---

## The Workflow — Phase by Phase

---

### Phase 0 — Idea / Request Intake

Every piece of work starts here, whether it's a feature request, bug report, or technical initiative.

**Who:** PM + Architect

**Output:**
```
╔══════════════════════════════════════════════════════════════╗
║  📥 INTAKE — Work Item                                       ║
╠══════════════════════════════════════════════════════════════╣
║  Title:         [one-line name]                              ║
║  Type:          Feature / Bug / Tech Debt / Security / Infra ║
║  Requestor:     [who asked for this]                         ║
║  Raw description: [what was asked]                           ║
║  Initial priority: [Critical / High / Medium / Low]          ║
╠══════════════════════════════════════════════════════════════╣
║  👉 Is this worth breaking down further? (yes / parking lot) ║
╚══════════════════════════════════════════════════════════════╝
```

---

### Phase 1 — Multi-Agent Planning Session

**Trigger:** A new feature or significant work item is approved for planning.

**Who participates:** All relevant agents (see voting table above for who votes on what).

**Step 1.1 — Problem Statement (PM + Architect)**

The PM frames the problem from the user perspective.
The Architect frames it from the system perspective.

```
## Problem Statement

**User need:** [What does the user need to do that they can't do now?]
**System impact:** [What parts of the system are affected?]
**Acceptance criteria:** [How do we know this is done?]
  - [ ] Criterion 1
  - [ ] Criterion 2
  - [ ] Criterion 3
**Out of scope:** [What are we explicitly NOT doing?]
```

**Step 1.2 — Agent Reviews**

Each relevant agent reviews the problem statement from their perspective and raises concerns or flags before design begins:

- **Architect:** Is this architecturally sound? Any design constraints?
- **Security:** Any threat surface introduced?
- **Pentester:** Any attack vectors opened?
- **DB Expert:** Any schema implications?
- **SRE:** Any reliability/SLO implications?
- **Tester:** Any testability concerns?
- **Data Engineer:** Any observability requirements?

**Step 1.3 — Architecture Design (Architect leads)**

The Architect proposes a solution. Other agents challenge and refine it.

```
## Architecture Proposal

**Approach:** [What will be built and how]
**Components affected:** [List]
**New components:** [List]
**Data flow:** [Sequence or diagram]
**API changes:** [New endpoints, changed contracts]
**DB changes:** [Schema changes required]
**Infrastructure changes:** [K8s, config, secrets]
**Security considerations:** [Threat model summary]
**Observability additions:** [Metrics, traces, dashboards]
```

**Step 1.4 — Vote if disputed**

If agents disagree on the approach:
1. Each disagreeing agent states their alternative with reasoning
2. Vote is called — only relevant agents vote (see voting table)
3. 5+ effective votes → proceed
4. No option reaches 5 → escalate to Ariel

---

### Phase 2 — Task Breakdown

**Who:** Architect + Backend + Frontend + DevOps (and others as needed)

**Output:** A list of tasks, each following this format:

```
## TASK-[SPRINT]-[NUMBER]: [Title]

**Type:** Backend / Frontend / DevOps / DB / Infra / Testing / Docs
**Assigned agent:** [which expert leads this]
**Estimated effort:** S (< 4h) / M (< 1d) / L (< 3d) / XL (needs splitting)
**Priority:** Critical / High / Medium / Low
**Dependencies:** [TASK-X must be done first]
**Acceptance criteria:**
  - [ ] Criterion 1
  - [ ] Criterion 2
**Required tests:**
  - [ ] Unit tests: [what to cover]
  - [ ] Integration tests: [what to cover]
  - [ ] E2E (Playwright): [which flows/components]
  - [ ] Performance: [if applicable]
**Definition of Done:**
  - [ ] Code written and self-reviewed
  - [ ] All required tests written and passing
  - [ ] Code reviewed by Code Reviewer
  - [ ] Approved by Tester
  - [ ] Approved by Architect
  - [ ] PR created (Ariel to merge)
```

**XL tasks must be split** — no task larger than 3 days enters a sprint.

---

### Phase 3 — Sprint Planning

**Who:** Architect + PM + all implementing agents

**Inputs:**
- Prioritized backlog of tasks
- Current sprint capacity
- Previous sprint regression results

**Process:**
1. Pull tasks from backlog by priority (Critical first, then High, then Medium)
2. Fit into 2-week capacity — don't overcommit
3. Identify dependencies and sequence tasks
4. Assign each task to the lead agent

**Sprint Plan Output:**

```
## Sprint [N] — [Start Date] to [End Date]

### Goal
[One sentence: what does a successful sprint look like]

### Tasks

| ID | Title | Lead Agent | Effort | Priority | Dependencies |
|---|---|---|---|---|---|
| TASK-N-01 | ... | Backend | M | High | — |
| TASK-N-02 | ... | Frontend | S | Medium | TASK-N-01 |

### Regression Sweep
- [ ] Tester runs full regression check at sprint start
- [ ] Any failures → inserted as Critical task immediately

### Sprint Risks
[Anything that might derail this sprint]
```

---

### Phase 4 — Implementation

**Each task follows this mini-workflow:**

```
1. Implementing agent reads the task definition
2. Reads relevant SKILL.md(s)
3. Presents implementation plan — waits for Architect approval
4. Implements — with tests as first-class deliverable
5. Self-reviews against skill checklist
6. Moves to Phase 5 (Review Gate)
```

**Testing requirements per task (non-negotiable):**

| Layer | Requirement |
|---|---|
| Business logic | xUnit unit tests — all branches covered |
| API endpoints | Integration tests with WebApplicationFactory |
| Angular components | Jest unit tests + **Playwright E2E spec** |
| DB changes | Migration tested up + down |
| New services | SRE production readiness checklist |
| Any new feature | Added to regression test suite |

---

### Phase 5 — Review Gate (before PR)

Every task must pass through three independent reviews before a PR is created.
Reviews happen in this order:

#### 5.1 — Tester Review

The Tester reviews the task from a quality perspective.

```
## Tester Review — TASK-[N]-[NN]

**Reviewer:** Tester Agent
**Date:** YYYY-MM-DD

### Tests Verified
- [ ] Unit tests: PASS (X/X)
- [ ] Integration tests: PASS (X/X)
- [ ] E2E Playwright: PASS (X/X)
- [ ] Performance: [N/A / PASS / numbers]

### Coverage
- Before: X%
- After: Y%
- New paths covered: [list key ones]

### Concerns
[Any quality issues, missing test cases, or risky untested paths]

### Verdict
✅ Approved / ❌ Request changes
[Short paragraph summarizing what was reviewed and the overall quality assessment]
```

#### 5.2 — Code Reviewer Review

```
## Code Review — TASK-[N]-[NN]

**Reviewer:** Code Reviewer Agent
**Date:** YYYY-MM-DD

### Findings
[List all findings by severity — Critical/Major/Minor/Suggestion]
[Each finding: file, line, issue, proposed fix]

### Tests Verified
- [ ] Tests exist for all new code paths
- [ ] Tests are meaningful (not just coverage padding)

### Concerns
[Anything that gave pause — even if not blocking]

### Verdict
✅ Approved / ❌ Request changes
[Short paragraph: what the change does, overall code quality, any trade-offs accepted]
```

#### 5.3 — Architect Review

```
## Architect Review — TASK-[N]-[NN]

**Reviewer:** Architect Agent
**Date:** YYYY-MM-DD

### Architectural Assessment
- [ ] Follows established patterns
- [ ] No unplanned coupling introduced
- [ ] API contracts are backward-compatible (or versioned)
- [ ] No architectural anti-patterns
- [ ] Security threat surface reviewed

### Tests Verified
- [ ] Test strategy is appropriate for the change
- [ ] Critical paths have adequate coverage

### Concerns
[Architectural concerns, technical debt introduced, follow-up tasks needed]

### Verdict
✅ Approved / ❌ Request changes / 🚫 Veto (with explanation)
[Short paragraph: architectural soundness, fit with system design, anything deferred]
```

**All three must approve** before a PR is created. If any reviewer requests changes, the task goes back to In Progress.

---

### Phase 6 — PR & Merge

**Only Ariel can merge.**

A PR is created only after all three reviews (Tester + Code Reviewer + Architect) are ✅ Approved.

**PR Description Template:**

```markdown
## [TASK-N-NN] [Title]

### What changed
[Short paragraph describing what was implemented]

### Why
[Link to the task / user story / bug that drove this]

### How to test
[Steps to manually verify the change]

### Checklist
- [ ] Tester approved (link to review)
- [ ] Code Reviewer approved (link to review)
- [ ] Architect approved (link to review)
- [ ] All CI checks passing
- [ ] No new warnings introduced
- [ ] Documentation updated (if needed)

### Screenshots / evidence
[For UI changes: before/after. For APIs: sample request/response]
```

**Ariel's merge checklist:**
- [ ] All three reviews are ✅ Approved
- [ ] CI pipeline is green
- [ ] No unresolved conversations on the PR
- [ ] Merge strategy: squash (feature tasks) or merge commit (releases)

---

### Phase 7 — Sprint Regression Sweep

**Who:** Tester Agent
**When:** Start of every sprint + end of every sprint

**Process:**

1. Tester runs the full automated test suite (unit + integration + E2E)
2. Tester runs manual smoke test of all critical user journeys
3. Any failure is classified by severity

**If a regression is found:**

```
## Regression Report — Sprint [N]

**Found by:** Tester (automated / manual)
**Severity:** Critical / High / Medium

### What broke
[Component, feature, endpoint]

### Steps to reproduce
[Exact steps]

### Last known good
[Sprint/commit where this worked]

### Impact
[Who is affected, what they can't do]

### Action
→ New task created: TASK-[N]-[REG-NN]
→ Priority: Critical (if severity Critical/High) or High (if Medium)
→ Inserted into current sprint immediately
→ Assigned to the agent whose domain owns the broken component
```

---

### Phase 8 — Sprint Retrospective

**Who:** All agents + Ariel

**Format:**

```
## Sprint [N] Retrospective

### Metrics
- Tasks planned: X
- Tasks completed: Y
- Tasks carried over: Z
- Regressions found: N
- Error budget consumed this sprint: X minutes

### What went well
[Honest — what worked]

### What didn't go well
[Honest — what slowed us down or caused problems]

### Action items for next sprint
| Action | Owner | Done by |
|---|---|---|
| ... | ... | Sprint N+1 start |
```

---

## Quick Reference — Task Lifecycle

```
[Intake] → [Planning: Problem + Architecture + Vote] → [Task Breakdown]
    → [Sprint Planning] → [Implementation + Tests]
    → [Tester Review] → [Code Review] → [Architect Review]
    → [PR Created] → [Ariel Merges] → [Done]
         ↑
    Regression found → Critical task → back into current sprint
```

---

## Rules That Never Change

1. **No code merges without all three reviews** (Tester + Code Reviewer + Architect)
2. **Only Ariel merges** — no exceptions
3. **Every task ships with tests** — no task is Done without tests
4. **Every Angular component has a Playwright spec** — shipped in the same task
5. **Regressions are current-sprint Critical** — they don't wait for next sprint
6. **Architect veto is binding** — can only be overridden by Ariel
7. **Sprints are 2 weeks** — can close early, never extend
8. **Voting threshold is 5 effective votes** — below that, Ariel decides
9. **Post-mortems are blameless** — systems fail, not people
10. **Prompts are versioned like code** — every AI feature change is tracked
