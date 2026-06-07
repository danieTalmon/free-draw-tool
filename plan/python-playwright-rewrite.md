# Rewrite Playwright E2E Tests in Python

> Workflow status: **TASK-01 ✅ TASK-02 ✅ — TASK-03 next**
> Date opened: 2026-06-03
> Requestor: Ariel

---

## Phase 0 — Intake

```
╔══════════════════════════════════════════════════════════════╗
║  📥 INTAKE — Work Item                                       ║
╠══════════════════════════════════════════════════════════════╣
║  Title:         Rewrite Playwright E2E tests in Python       ║
║  Type:          Tech Debt / Infra                            ║
║  Requestor:     Ariel                                        ║
║  Raw description: "rewrite the playwright test in python"    ║
║  Initial priority: Medium                                    ║
╠══════════════════════════════════════════════════════════════╣
║  👉 Worth breaking down? yes                                 ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Phase 1 — Planning Session

### Problem Statement

**User need:**
Run the full E2E test suite from Python so the QA / infra team can maintain and extend tests in their primary language without switching to TypeScript or Node tooling.

**System impact:**

- Source file: `e2e/draw-bugs.spec.ts` → `e2e/draw_bugs.py`
- New files: `requirements.txt`, `pytest.ini` (or `pyproject.toml` section)
- `playwright.config.ts` stays unchanged (drives TypeScript spec if kept)
- No changes to any Angular source code

**Acceptance criteria:**

- [ ] All tests in `e2e/draw-bugs.spec.ts` ported 1-to-1 to `e2e/draw_bugs.py`
- [ ] `pytest e2e/draw_bugs.py` runs and passes against the dev server (`http://localhost:4200`)
- [ ] Screenshots saved to `e2e-screenshots/` with the same filenames as the TypeScript originals
- [ ] All helper functions (`get_canvas_bounds`, `read_point`, `seed_shape_points`, `drag_current_shape_to`, `open_saved_shape_for_edit`, `add_saved_shape_and_get_edge_geometry`, `right_click_near_saved_shape_hit_area`) are ported
- [ ] The original TypeScript spec is **not deleted** until Ariel explicitly signs off
- [ ] `requirements.txt` lists all Python dependencies

**Out of scope:**

- Adding new tests
- Changing test logic or assertions
- Modifying the Angular application
- Setting up CI for the Python tests (separate task if needed)

---

### Step 1.2 — Agent Reviews

#### Architect Review (×3 votes)

**1. Architecturally sound?**
Yes. The Angular app is tested as a black box via HTTP + browser DOM — there is no language coupling between the test runner and the application. `pytest-playwright` is the direct, officially-supported Python equivalent of `@playwright/test`, sharing the same underlying Playwright engine and protocol. The only constraint: `page.evaluate()` calls depend on `window.ng` being available, which requires Angular running in dev/debug mode (not `enableProdMode()`). This is already true for the TS tests — the Python port inherits the same constraint unchanged.

**2. Sync vs async?**
Use the **sync API**. The TypeScript tests use `async/await` only because the JS event loop requires it — the logic is fully sequential. Python `asyncio` would add noise with zero benefit. `pytest-playwright` exposes synchronous fixtures that are idiomatic pytest.

**3. File location?**
`e2e/draw_bugs.py` — correct. Keep all E2E artefacts co-located in `e2e/`. Splitting into a second directory gains nothing.

**4. `playwright.config.ts` — keep alongside?**
Keep it. It drives the TypeScript spec only; pytest ignores it entirely. Create a `pytest.ini` for the Python side. Both coexist without conflict.

**5. `page.evaluate()` string parity risk?**
Low risk, one gotcha: Python f-strings interpret `{` and `}` as interpolation. Any JS body with braces (common in these helpers) must never be in an f-string. Always pass dynamic data as the second argument:

```python
page.evaluate("(arg) => { ... }", {"key": "value"})
```

This mirrors the TS pattern exactly and avoids all escaping issues.

**6. Delete the TypeScript spec?**
No. Keep it as the reference baseline and safety net until Ariel signs off on a full passing Python run. Both coexist because `playwright.config.ts` globs `*.spec.ts` and pytest globs `*.py`.

**7. Structural recommendations?**

- `beforeEach` logic → `e2e/conftest.py` fixture with `autouse=True`
- Helper functions → module-level functions in `e2e/helpers.py` (not closures, not class methods)
- `pytest.ini` with `addopts = --browser chromium --base-url http://localhost:4200`
- No class wrapper — keep all test functions at module level with `test_` prefix

**Vote: ✅ Proceed (×3)**

---

#### Tester Review (×1 vote)

**1. Sync API** — confirmed default for `pytest-playwright`, no `asyncio-mode` plugin needed.

**2. `beforeEach` → `autouse` fixture in `conftest.py`:**

```python
@pytest.fixture(autouse=True)
def setup(page):
    page.goto('/')
    page.wait_for_timeout(3000)
    error_panel = page.locator('.cesium-widget-errorPanel')
    try:
        if error_panel.is_visible(timeout=1000):
            btn = error_panel.locator('button')
            if btn.is_visible(timeout=500):
                btn.click(force=True)
                page.wait_for_timeout(500)
    except Exception:
        pass
    page.locator('.mode-btn').first().click(force=True)
    page.wait_for_timeout(500)
```

**3. `wait_for_timeout` risk:** `page.wait_for_timeout(ms)` exists in the sync API — direct translation. The 3 s Cesium wait is pre-existing fragility; flag for future hardening but do not change during the port.

**4. Helper structure:** Module-level functions in `e2e/helpers.py`. Fixtures are for lifecycle, not stateless utilities.

**5. Test isolation:** `page` fixture is function-scoped by default — each test gets a fresh browser context, matching the TS behaviour. Set `workers=1` in `pytest.ini` to match `playwright.config.ts`.

**6. JS string quoting pitfall:** Never use f-strings for JS bodies containing `{`. Use triple-quoted strings and pass data as the second `evaluate()` argument.

**7. Screenshot paths:** Relative to `cwd`. Add `Path("e2e-screenshots").mkdir(exist_ok=True)` in `conftest.py` — Python's Playwright does not auto-create the directory.

| Risk area                 | Severity           | Mitigation                                        |
| ------------------------- | ------------------ | ------------------------------------------------- |
| f-string brace collision  | Medium             | Never f-string JS bodies; always pass data as arg |
| Missing screenshots dir   | Low                | `mkdir(exist_ok=True)` in conftest                |
| 3 s Cesium wait flakiness | Low / pre-existing | Port as-is; flag for hardening                    |
| Test isolation            | Low                | Default function-scoped page; workers=1           |

**Vote: ✅ Proceed**

---

#### DevOps Review (×1 vote)

**1. `requirements.txt` — pin versions:**

```
pytest==9.0.3
pytest-playwright==0.8.0
playwright==1.60.0
```

Bare names are non-reproducible. Pin to currently installed versions.

**2. Config home — `pytest.ini`:**

```ini
[pytest]
addopts = --browser chromium --screenshot only-on-failure
```

`pyproject.toml` adds unneeded build-system overhead. `conftest.py` is for fixtures.

**3. Base URL — mirror the TS env var:**

```python
# conftest.py
@pytest.fixture(scope="session")
def base_url() -> str:
    return os.environ.get("PLAYWRIGHT_BASE_URL", "http://localhost:4200")
```

`pytest-playwright` picks up `base_url` fixture automatically. One env var (`PLAYWRIGHT_BASE_URL`) controls both suites.

**4. `~/.local/bin/playwright` path issue:** Use a venv for local dev (`python -m venv .venv && source .venv/bin/activate`). For one-off installs: `python -m playwright install chromium` works regardless of `PATH`. Document in README.

**5. Side-by-side TS + Python:** No conflict. Chromium binaries are duplicated in `~/.cache/ms-playwright` (acceptable for dev). Add `testMatch: ['**/*.spec.ts']` to `playwright.config.ts` to make the `*.spec.ts`-only boundary explicit.

**6. CI step (future reference):**

```yaml
- run: pip install -r requirements.txt
- run: python -m playwright install chromium --with-deps
- run: pytest e2e/draw_bugs.py -v
  env:
    PLAYWRIGHT_BASE_URL: http://localhost:4200
```

`--with-deps` installs OS Chromium system libs (required on Ubuntu CI).

**Required actions before implementation:**

| Item                   | Action                                  |
| ---------------------- | --------------------------------------- |
| `requirements.txt`     | Pin to installed versions               |
| `pytest.ini`           | Create with `addopts` and `workers=1`   |
| `conftest.py`          | `base_url` + `setup` + `mkdir` fixtures |
| `playwright.config.ts` | Add `testMatch: ['**/*.spec.ts']`       |
| README                 | Add Python dev setup section            |

**Vote: ✅ Proceed**

---

### Step 1.4 — Final Vote

| Agent     | Votes | Decision   |
| --------- | ----- | ---------- |
| Architect | 3     | ✅ Proceed |
| Tester    | 1     | ✅ Proceed |
| DevOps    | 1     | ✅ Proceed |
| **Total** | **5** | ✅ **GO**  |

**Agreed decisions:**

- Sync API (no asyncio)
- `e2e/conftest.py` for `beforeEach` fixture (autouse) + `base_url` + `mkdir`
- `e2e/helpers.py` for the 7 helper functions (module-level)
- `e2e/draw_bugs.py` for all 17 test functions (module-level, `test_` prefix)
- `pytest.ini` for config (`--browser chromium`, `workers=1`)
- `requirements.txt` with pinned versions
- `playwright.config.ts` gets `testMatch: ['**/*.spec.ts']`
- TypeScript spec is NOT deleted

---

### Step 1.3 — Architecture Proposal (Architect)

**Approach:**
Port `e2e/draw-bugs.spec.ts` to `e2e/draw_bugs.py` using `pytest` + `pytest-playwright` sync API. The JavaScript strings inside `page.evaluate()` are identical to the TypeScript originals — they run in the browser and are language-agnostic.

**Components affected:**

- `e2e/draw-bugs.spec.ts` — kept as-is (not deleted)
- `playwright.config.ts` — add `testMatch: ['**/*.spec.ts']` only

**New components:**

- `e2e/conftest.py` — `base_url` fixture, `setup` autouse fixture, screenshot dir init
- `e2e/helpers.py` — 7 ported helper functions
- `e2e/draw_bugs.py` — 17 ported test functions
- `requirements.txt` — pinned Python dependencies
- `pytest.ini` — pytest + playwright config

**Data flow:**

```
pytest → pytest-playwright fixture → Chromium → localhost:4200 (Angular app)
                                             ↕
                              page.evaluate(js, arg) → window.ng → Angular components
```

**API changes:** None.
**DB changes:** None.
**Infrastructure changes:** None. Chromium binary already installed.

**Security:** `page.evaluate()` runs in-browser JS against a local dev server only. No production surface affected.

**Observability:** Screenshots to `e2e-screenshots/` (directory auto-created by conftest).

---

## Phase 2 — Task Breakdown

---

### TASK-01: Bootstrap Python environment and config files

**Type:** Infra / DevOps
**Assigned agent:** DevOps
**Estimated effort:** S (< 4h)
**Priority:** Medium
**Dependencies:** None
**Status:** ✅ Done

**Acceptance criteria:**

- [x] `requirements.txt` with pinned versions (`pytest==9.0.3`, `pytest-playwright==0.8.0`, `playwright==1.60.0`)
- [x] `pip install -r requirements.txt` succeeds
- [x] `playwright install chromium` installs the browser binary
- [x] `pytest.ini` created with `addopts = --browser chromium --screenshot only-on-failure`
- [x] `playwright.config.ts` gets `testMatch: ['**/*.spec.ts']`

**Definition of Done:**

- [x] `requirements.txt` created
- [x] `pytest.ini` created
- [x] `playwright.config.ts` updated

---

### TASK-02: Create `e2e/conftest.py` and `e2e/helpers.py`

**Type:** Testing
**Assigned agent:** Tester
**Estimated effort:** M (< 1d)
**Priority:** Medium
**Dependencies:** TASK-01

**`e2e/conftest.py` must contain:**

- `base_url` session-scoped fixture reading `PLAYWRIGHT_BASE_URL` env var (default `http://localhost:4200`)
- `setup` autouse fixture: navigate, 3s wait, dismiss Cesium error panel, click `.mode-btn`
- `Path("e2e-screenshots").mkdir(exist_ok=True)` on module init

**`e2e/helpers.py` must contain all 7 helpers:**

| TypeScript                                    | Python                                              |
| --------------------------------------------- | --------------------------------------------------- |
| `getCanvasBounds(page)`                       | `get_canvas_bounds(page)`                           |
| `readPoint(page, index)`                      | `read_point(page, index)`                           |
| `seedShapePoints(page, coords)`               | `seed_shape_points(page, coords)`                   |
| `dragCurrentShapeTo(page, lng, lat)`          | `drag_current_shape_to(page, lng, lat)`             |
| `openSavedShapeForEdit(page, dto)`            | `open_saved_shape_for_edit(page, dto)`              |
| `addSavedShapeAndGetEdgeGeometry(page, dto)`  | `add_saved_shape_and_get_edge_geometry(page, dto)`  |
| `rightClickNearSavedShapeHitArea(page, geom)` | `right_click_near_saved_shape_hit_area(page, geom)` |

**Acceptance criteria:**

- [x] All helpers in `helpers.py` as module-level functions (no class, no fixtures)
- [x] All `page.evaluate()` calls pass data as second argument (no f-strings on JS bodies)
- [x] Sync API throughout — no `asyncio`
- [x] `conftest.py` exports `base_url` and `setup` fixtures
- [x] `e2e-screenshots/` dir auto-created

**Definition of Done:**

- [x] Both files created and importable
- [x] `pytest --collect-only` shows no import errors

---

### TASK-03: Port all test cases to Python

**Type:** Testing
**Assigned agent:** Tester
**Estimated effort:** L (< 3d)
**Priority:** Medium
**Dependencies:** TASK-02

**Tests to port:**

| #   | Test name                                                                                 |
| --- | ----------------------------------------------------------------------------------------- |
| 1   | Bug 1 & 2: Polyline preview points should display on map after clicking                   |
| 2   | Bug 1: Polyline drag and drop should update point coordinates                             |
| 3   | Bug 1: Polygon drag and drop should update point coordinates                              |
| 4   | Regression: Saved polyline should be draggable in edit mode                               |
| 5   | Regression: Saved polyline should drag without preselection and without open-edit state   |
| 6   | Regression: Saved polygon should drag without preselection and without open-edit state    |
| 7   | Regression: Saved circle drag should not start a new temp circle                          |
| 8   | Regression: Cancel in create mode should reset form and clear temp circle                 |
| 9   | Bug 3: Clicking should populate coordinates in the form                                   |
| 10  | Bug 15: Save button should be enabled after drawing circle on map                         |
| 11  | Bug 4: Text shape drag and drop should work                                               |
| 12  | Regression: Saved text shape should reopen with saved coordinates                         |
| 13  | Regression: Reopened text drag should update form coordinates                             |
| 14  | Regression: Save should stay disabled when opening unchanged saved shape and after cancel |
| 15  | Regression: Reopened saved circle should drag even when mouse-down map pick misses        |
| 16  | Bug 5: Color option should affect the shape entity                                        |
| 17  | Feature: Polygon row + inserts after clicked row and - removes related row                |

**Acceptance criteria:**

- [ ] All 17 tests present in `e2e/draw_bugs.py` as `test_` prefixed module-level functions
- [ ] Test logic and assertions are 1-to-1 with the TypeScript originals
- [ ] `beforeEach` setup delegated to `conftest.py` `setup` autouse fixture (no duplication per test)
- [ ] No f-strings used on JS bodies in `page.evaluate()` calls
- [ ] Helpers imported from `e2e/helpers.py`

**Definition of Done:**

- [ ] All tests implemented
- [ ] `pytest e2e/draw_bugs.py --collect-only` lists all 17 tests without import errors

---

### TASK-04: Validate tests pass against dev server

**Type:** Testing / QA
**Assigned agent:** Tester
**Estimated effort:** S (< 4h)
**Priority:** Medium
**Dependencies:** TASK-03

**Acceptance criteria:**

- [ ] `pytest e2e/draw_bugs.py` runs without import/syntax errors
- [ ] Tests pass (or fail for the same reasons the TS originals fail — parity, not regression)
- [ ] Screenshots appear in `e2e-screenshots/`
- [ ] `PLAYWRIGHT_BASE_URL` env var controls the target URL for both suites

**Definition of Done:**

- [ ] Ariel confirms pass/fail parity with the TypeScript suite
- [ ] TypeScript spec confirmed not deleted
