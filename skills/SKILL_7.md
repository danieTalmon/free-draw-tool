---
name: engineering-workflow
description: >
  A structured engineering workflow for ALL programming, coding, and logical tasks — no matter the language, framework, or complexity.
  ALWAYS use this skill when the user asks to build, implement, design, refactor, fix, or plan any code or software system.
  This skill enforces a plan-first, approve-before-proceeding methodology with high code quality standards.
  Trigger on: "build me", "implement", "create a", "write a script", "design a system", "refactor", "add a feature",
  "fix this", "how should I structure", "help me code", or any request involving software development or algorithms.
  Even for small tasks — always at minimum present a brief plan and wait for approval before writing code.
---

# Engineering Workflow Skill

A disciplined, approval-gated workflow for all software development tasks.
The goal: think before typing, build the right thing, build it well.

---

## Core Philosophy

- **Plan before code.** Never write a line of code before the plan is approved.
- **Approval gates are mandatory.** Stop at every gate. Wait for explicit user approval before continuing.
- **Quality is non-negotiable.** Every piece of code follows the standards in this skill.
- **Tests are first-class citizens.** Not an afterthought — built into every task.
- **Self-documenting code.** Names and structure explain the flow. Comments are a last resort.
- **Language-aware quality.** Apply idiomatic best practices for the detected language/framework.

---

## The Workflow — 5 Stages

```
[Stage 1: Understand & Explore]
        ↓ APPROVAL GATE 1
[Stage 2: Architecture & Technology Decision]
        ↓ APPROVAL GATE 2
[Stage 3: Roadmap & Task Breakdown]
        ↓ APPROVAL GATE 3
[Stage 4: Implementation — task by task]
        ↓ (per-task checkpoint gates)
[Stage 5: README & Documentation]
```

---

## Stage 1 — Understand & Explore

Before proposing any solution, make sure you fully understand the task.

**Do:**
- Restate the problem in your own words
- Identify: inputs, outputs, constraints, scale, environment
- Identify the language, framework, and stack in use or being considered
- Ask clarifying questions if anything is ambiguous
- Surface hidden complexity or edge cases early

**Do not** propose solutions yet.

When confident you understand the task, present Gate 1:

```
╔══════════════════════════════════════════════════╗
║  ✅ APPROVAL GATE 1 — Problem Understanding      ║
╠══════════════════════════════════════════════════╣
║  Task:           [one-line summary]              ║
║  Language/Stack: [detected or assumed]           ║
║  Inputs:         [what goes in]                  ║
║  Outputs:        [what comes out]                ║
║  Constraints:    [tech, perf, security, scale]   ║
║  Open questions: [anything still unclear]        ║
╠══════════════════════════════════════════════════╣
║  👉 Does this match your intent?                 ║
║     Proceed? (yes / no / corrections)            ║
╚══════════════════════════════════════════════════╝
```

**Wait for explicit approval before continuing.**

---

## Stage 2 — Architecture & Technology Decision

The thinking stage. Explore the space, then commit to a direction.

### 2a. Explore the Solution Space

For each viable approach:
- Name the approach clearly
- Describe how it solves the problem
- List pros and cons honestly

### 2b. Present the Recommended Architecture

1. **Chosen Approach** — what it is and why
2. **Advantages** — what makes this right for this specific context
3. **Disadvantages / Trade-offs** — be honest, don't hide weaknesses
4. **Alternatives Rejected** — each alternative with a brief reason why not chosen
5. **Security Considerations** — input validation, secrets, auth, attack surface
6. **Performance Considerations** — obvious bottlenecks or scaling concerns
7. **Dependencies** — libraries/packages to use and justification (build vs buy)

### 2c. Gate 2

```
╔══════════════════════════════════════════════════╗
║  ✅ APPROVAL GATE 2 — Architecture Plan          ║
╠══════════════════════════════════════════════════╣
║  Chosen approach:       [name]                   ║
║  Key technologies:      [list]                   ║
║  Main trade-off:        [what we're giving up]   ║
║  Rejected alternatives: [names + one-line why]   ║
╠══════════════════════════════════════════════════╣
║  👉 Approve this architecture?                   ║
║     Proceed? (yes / no / changes)                ║
╚══════════════════════════════════════════════════╝
```

**Wait for explicit approval before continuing.**

---

## Stage 3 — Roadmap & Task Breakdown

Break the approved architecture into an ordered, logical task list.

### Task Format

Each task includes:
- **Task ID**: T-01, T-02, ...
- **Title**: short verb-noun (e.g., "Implement auth middleware")
- **Description**: what will be built
- **Depends on**: which prior tasks must be complete
- **Testing checkpoint**: how this task will be verified before moving on
- **Complexity**: S / M / L

### Rules

- Order tasks so each one builds on a stable foundation
- Never combine unrelated concerns in one task
- Include an integration/E2E test task at the end of each significant milestone
- Final task is always: "Write README and documentation"
- Mark milestone boundaries explicitly

### Example Format

```
📋 PROJECT ROADMAP
════════════════════════════════════════════════
T-01 | Set up project structure & config     [S]
     | ✔ project runs, environment loads
T-02 | Implement data models / schema        [M]
     | ✔ models validate correctly
T-03 | Implement core business logic         [L]
     | ✔ unit tests pass all logic paths
──────────────── MILESTONE: Core Complete ───────
T-04 | Implement API / interface layer       [M]
     | ✔ endpoints return correct shapes
T-05 | Integration test: full flow E2E       [M]
     | ✔ happy path + all error paths
T-06 | Write README                          [S]
════════════════════════════════════════════════
```

### Gate 3

```
╔══════════════════════════════════════════════════╗
║  ✅ APPROVAL GATE 3 — Roadmap                    ║
╠══════════════════════════════════════════════════╣
║  Total tasks: [N]    Milestones: [M]             ║
║  Starting with: T-01 — [title]                   ║
╠══════════════════════════════════════════════════╣
║  👉 Approve this roadmap?                        ║
║     Proceed? (yes / no / changes)                ║
╚══════════════════════════════════════════════════╝
```

**Wait for explicit approval before continuing.**

---

## Stage 4 — Implementation

Work through tasks one at a time.
**Never start the next task without completing and getting approval on the current one.**

### Per-Task Flow

1. Announce: `▶ Starting T-XX: [title]`
2. Write code following all quality standards below
3. Write tests for this task
4. Present code + tests to the user
5. Present the task checkpoint:

```
╔══════════════════════════════════════════════════╗
║  🧪 TASK CHECKPOINT — T-XX: [title]              ║
╠══════════════════════════════════════════════════╣
║  Code written:   [files / functions created]     ║
║  Tests written:  [what is covered]               ║
║  To verify:      [what the user should run/check]║
╠══════════════════════════════════════════════════╣
║  👉 Tests passing? Ready to proceed to T-XX+1?   ║
║     Proceed? (yes / no / issues found)           ║
╚══════════════════════════════════════════════════╝
```

6. **Wait for explicit approval before the next task.**

---

## Code Quality Standards

These apply to **every line of code**, in every language.

### Naming

- **Functions/methods**: verb-noun, describes exactly what it does
  → `fetchUserById`, `calculateMonthlyTax`, `validateEmailFormat`
- **Variables**: name what the value *represents*, not its type
  → `activeUserCount`, `orderTotalAfterDiscount` — not `n`, `temp`, `data`
- **Booleans**: prefix with `is`, `has`, `can`, `should`
  → `isAuthenticated`, `hasExpired`, `canRetry`
- **Avoid**: vague names (`manager`, `handler`, `utils` without context), single-letter names (except loop counters)

### Function Design

- **One function, one responsibility.** If you need "and" to describe it — split it.
- **Short functions.** Extract logical sub-steps into named helpers.
- **Pure when possible.** Prefer no side effects; isolate I/O and mutations.
- Compose small pure functions with a unifying function when needed.

### Logging

- **INFO**: significant state transitions, successful completions of major operations, request summaries
- **DEBUG**: intermediate values, branching decisions, detailed tracing
- **WARN**: recoverable issues, unexpected-but-handled situations
- **ERROR**: failures that affect the operation — always include context (what failed, with what input)
- **Never log sensitive data**: passwords, tokens, PII
- Log enough context at entry points to reconstruct what happened during investigation

### Comments

- **Code explains itself through naming and structure.** If you need a comment to explain *what* — rename instead.
- Comments are for: *why* a non-obvious decision was made, spec/regulatory references, known workarounds with context
- No commented-out code. No unresolved `TODO` left in delivered code.

### Error Handling

- Never swallow errors silently — at minimum, log them
- Distinguish: expected errors (handle gracefully), programming errors (fail loudly), external errors (retry/fallback)
- Return meaningful error messages that help the caller understand what went wrong
- Validate inputs at system boundaries (API endpoints, public interfaces)

### Security

- Never hardcode secrets, tokens, or passwords — use environment variables or a secrets manager
- Validate and sanitize all external input
- Principle of least privilege — request only what is needed
- Flag any auth/authorization decisions explicitly

### Testing

- Test **behavior**, not implementation details
- Cover: happy path, edge cases, error/failure paths
- Name tests descriptively: `shouldReturnNullWhenUserNotFound`, `shouldThrowWhenInputIsNegative`
- Integration tests at milestone boundaries; E2E test at project completion

---

## Language-Specific Best Practices

At **Stage 1**, identify the language and framework from the task context.
Throughout the **entire workflow**, layer on that language's idiomatic standards.

### What "idiomatic standards" means per language

Apply the following dimensions for the detected language:

| Dimension | What to apply |
|-----------|--------------|
| **Project structure** | The community-standard folder/module layout |
| **Naming conventions** | PascalCase, snake_case, camelCase — as the language dictates |
| **Idioms & patterns** | Language-native patterns (e.g., async/await, context managers, RAII, interfaces, goroutines) |
| **Toolchain** | Standard formatter, linter, package manager, test framework |
| **Error handling style** | Exceptions vs error-as-value vs Result types — as the language dictates |
| **Performance & safety** | Memory management, concurrency model, type system usage |

### Language reference table

| Language / Framework | Key standards to apply |
|----------------------|----------------------|
| **C# / .NET** | Microsoft conventions, PascalCase methods, `_camelCase` fields, DI via constructor, async/await all the way down, xUnit, Serilog structured logging, thin controllers |
| **TypeScript / Angular** | Strict TypeScript, Angular style guide, smart/dumb components, RxJS declarative streams, OnPush CD, lazy-loaded modules, Jasmine or Jest |
| **TypeScript / React** | Strict TypeScript, functional components + hooks, single-responsibility components, React Testing Library + Jest, no prop drilling (context/state manager) |
| **Python** | PEP 8, type hints everywhere, snake_case, virtual environments, pytest, Black formatter, ruff/flake8 linter |
| **Java** | Google Java style, PascalCase classes, camelCase methods, Maven/Gradle, JUnit 5, Spring conventions if applicable |
| **JavaScript / Node.js** | ESLint, ESM modules preferred, async/await, Jest, distinguish config from code |
| **C** | POSIX conventions, explicit memory management, header/source separation, valgrind-clean, const correctness |
| **C++** | Modern C++ (C++17/20), RAII, smart pointers (no raw `new/delete`), const correctness, Google or LLVM style, Google Test or Catch2 |
| **Go** | gofmt enforced, error-as-value (never ignore errors), goroutines + channels for concurrency, table-driven tests, small interfaces |
| **Rust** | Ownership model respected, `Result`/`Option` instead of panics, clippy warnings treated as errors, cargo test, idiomatic trait usage |
| **Other / unknown** | Apply universal principles: SOLID, DRY, KISS, YAGNI, plus research and apply the community standard for that language |

**Critical rule: Never apply best practices from one language to another.**
Each language has its own idioms — mixing them produces confusing, non-idiomatic code.

If the language is not in the table above, reason from first principles:
- What does the language's official style guide say?
- What does the community consider idiomatic?
- What is the standard test framework and toolchain?

---

## Stage 5 — README & Documentation

### Gate 4 — Before writing the README

```
╔══════════════════════════════════════════════════╗
║  ✅ APPROVAL GATE 4 — Ready for Documentation    ║
╠══════════════════════════════════════════════════╣
║  All tasks complete: [T-01 ... T-XX ✔]           ║
║  E2E test result:    [passed / notes]            ║
║  Known issues:       [any open items]            ║
╠══════════════════════════════════════════════════╣
║  👉 Approve to proceed to README writing?        ║
║     Any final changes before we document?        ║
║     Proceed? (yes / no / changes)                ║
╚══════════════════════════════════════════════════╝
```

**Wait for explicit approval before writing the README.**

After approval, write a `README.md` that covers:

1. **Project name & one-line description**
2. **Architecture overview** — what the system is made of and why
3. **Prerequisites** — what needs to be installed
4. **How to run** — step by step, including environment setup
5. **How to run tests**
6. **Project structure** — directory tree with a one-line explanation per folder/file
7. **Key design decisions** — brief explanation of major choices made
8. **Known limitations / future improvements**

The README must be clear enough for a new developer to understand and run the project without asking questions.

---

## Approval Gates — Quick Reference

| Gate | When | Blocks |
|------|------|--------|
| Gate 1 | Problem understood | Architecture work |
| Gate 2 | Architecture approved | Roadmap work |
| Gate 3 | Roadmap approved | Any coding |
| Task Checkpoint | Each task complete + tested | Next task |
| Gate 4 | All tasks + E2E done | README writing |

**If the user says "skip gates" or "just do it"** — acknowledge, but still present a one-paragraph plan summary and wait for a quick go-ahead. Never write code completely blind.
