# Circle Unfilled Requirement - Expert Discussion

**Date:** 2026-05-28  
**Requirement:** Circles should be rendered without inner fill color - only the circle outline should be colored.  
**Status:** Approved for implementation

---

## Expert Panel Discussion

### Frontend Expert Assessment

**Recommended Approach:** Use `fill: false` (idiomatic Cesium approach)

```typescript
ellipse: {
  fill: false,                    // ← ADD THIS
  // material: ... ← REMOVE
  outline: true,
  outlineColor: color,
  outlineWidth: lineWidth,
}
```

**UX Impact:**
| Concern | Risk | Mitigation |
|---------|------|------------|
| Click target shrinks | Medium | Center drag handle + proximity fallback already exist |
| Visual consistency | Low | Polylines/polygons already render as strokes only |
| Edit mode picking | Low | Center handle remains fully pickable |

**Verdict:** Safe to implement. Existing center drag handle and proximity fallback logic handle picking scenarios.

---

### Tester Expert Assessment

**Tests Requiring Updates:**

| File | Test | Change Needed |
|------|------|---------------|
| saved-shapes.service.spec.ts | "should add a circle shape" | Assert no fill material |
| draw-tool.service.spec.ts | "should start drawing circle" | Assert entity has outline but no fill |

**E2E Risk:** Low - saved circles use separate hit entity for detection; temporary circles use center drag handle.

**Recommended New Tests:**
1. Unit test: Circle with outline only (no fill)
2. Unit test: Circle hit entity with invisible fill for click detection
3. E2E test: Verify temporary circle draggable via center handle

**Priority:**
- P0: Run existing E2E circle tests before merge
- P1: Add unit tests asserting no fill material

---

### Project Architect Assessment

**Consistency Analysis:** ✅ Improves alignment
- Polylines: outline-only
- Polygons: outline-only (closed polyline)
- Circles: **currently filled** (anomaly) → **should be outline-only**

**Hidden Dependencies:**
| Concern | Status |
|---------|--------|
| Visual hit detection (saved shapes) | ✅ Safe - uses separate invisible hit entity |
| Interior drag (drawing mode) | ✅ Safe - uses geometric calculation, not rendered fill |
| Data model | ✅ No impact - fill is presentation-only |

**Recommendation:** Hard-coded removal (no fill option). YAGNI - no configurable fill needed now.

**Scope:** Pure presentation change in 2 service files.

---

## Approval Gate

```
╔══════════════════════════════════════════════════════════════════╗
║  ✅ EXPERT PANEL VERDICT: APPROVED                               ║
╠══════════════════════════════════════════════════════════════════╣
║  Scope:           Presentation-only, 2 files                     ║
║  Risk:            Low                                            ║
║  Consistency:     Improves alignment with polyline/polygon       ║
║  Approach:        Remove material, add fill: false               ║
║  Test Impact:     Low - update assertions in existing tests      ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Implementation Plan

### Files to Modify

1. **draw-tool.service.ts** (~line 765)
   - Remove `material: new ColorMaterialProperty(color.withAlpha(0.3))`
   - Add `fill: false`

2. **saved-shapes.service.ts** (~line 295)
   - Remove `material: new ColorMaterialProperty(color.withAlpha(0.3))`
   - Add `fill: false`

### Tests to Update

1. **draw-tool.service.spec.ts** - Update/add assertions for no fill
2. **saved-shapes.service.spec.ts** - Update/add assertions for no fill
3. Run E2E tests to verify no regressions
