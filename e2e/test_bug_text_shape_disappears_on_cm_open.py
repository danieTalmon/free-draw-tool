"""
Bug regression tests: B-017
Title: Saved shape disappears from map after CM edit open or shape-type switch

Fix applied (Option A — DrawingSessionService): hideShape is called when a saved shape
is opened for editing, and showShape is called on every termination path (cancel,
type-switch, save, mode-exit). The saved entity is hidden during editing (to avoid double
vertex overlaps) but must be fully restored on any exit path.

Scenarios covered:
  1. Cancel path   — open for editing, cancel → entity must be visible after cancel
  2. Type-switch   — open for editing, select different draw type → entity must be visible
  3. Screenshot    — visual evidence capture on cancel path
"""

import pytest
from playwright.sync_api import Page


TEXT_SHAPE_DTO = {
    "id": "text-bug-b017",
    "name": "BugProofText",
    "shapeType": "DRAW_TEXT",
    "points": [
        {
            "coordinates": {"latitude": 32.05, "longitude": 34.85},
            "altitude": {"feet": 0},
        }
    ],
    "lineType": "solid",
    "lineWidth": 2,
    "lineColor": "#00ffff",
}


def _add_saved_text_and_open_for_edit(page: Page) -> None:
    """Replicates exactly what context-menu 'edit' does in map.component.ts."""
    page.evaluate(
        """(dto) => {
            const mapCmp = window.ng.getComponent(document.querySelector('app-map'));
            mapCmp.isEditMode = true;
            mapCmp.savedShapesService.addShape(dto);
            const savedShape = mapCmp.savedShapesService.getShapeById(dto.id);
            if (!savedShape) throw new Error('Shape not added: ' + dto.id);

            // This is exactly what onContextMenuAction('edit') calls
            mapCmp['openShapeForEditing'](savedShape);

            if (window.ng?.applyChanges) {
                window.ng.applyChanges(mapCmp);
            }
        }""",
        TEXT_SHAPE_DTO,
    )


def _entity_visible(page: Page, shape_id: str) -> bool:
    return page.evaluate(
        """(id) => {
            const mapCmp = window.ng.getComponent(document.querySelector('app-map'));
            const saved = mapCmp.savedShapesService.getShapeById(id);
            if (!saved) return null;
            return saved.entity?.show ?? null;
        }""",
        shape_id,
    )


def _cancel_editing(page: Page) -> None:
    """Click the Cancel button on the edit-draw form."""
    cancel_btn = page.locator('[data-test-id="edit-draw-cancel-button"]').first
    if cancel_btn.is_visible(timeout=2000):
        cancel_btn.click()
        page.wait_for_timeout(300)
    else:
        # Fallback: trigger cancel via Angular facade directly
        page.evaluate(
            """() => {
                const editCmp = window.ng.getComponent(document.querySelector('app-edit-draw'));
                if (editCmp && editCmp.cancel) {
                    editCmp.cancel();
                }
                if (window.ng?.applyChanges) {
                    const mapCmp = window.ng.getComponent(document.querySelector('app-map'));
                    window.ng.applyChanges(mapCmp);
                }
            }"""
        )
        page.wait_for_timeout(300)


def test_text_shape_entity_visible_after_cm_open(page: Page) -> None:
    """
    B-017 fix (Option A) — cancel path: the saved Text entity is intentionally
    hidden during editing (to prevent vertex overlap) and must be fully restored
    after cancel.
    """
    _add_saved_text_and_open_for_edit(page)
    page.wait_for_timeout(300)

    # Option A: entity IS hidden while the edit form is open (expected behavior)
    # We do not assert visibility here — the session correctly hides it.

    _cancel_editing(page)

    # After cancel the saved entity must be visible again
    visible_after_cancel = _entity_visible(page, TEXT_SHAPE_DTO["id"])
    assert visible_after_cancel is True, (
        f"B-017 REGRESSION: saved Text entity still hidden after cancel "
        f"(entity.show={visible_after_cancel})"
    )


def test_text_shape_stays_visible_after_type_switch(page: Page) -> None:
    """
    B-017 fix — type-switch path: switching draw type while a saved shape edit
    is open must NOT hide the saved shape (previously the hideShape call on
    open was never undone when startDrawing was called for the new type).
    """
    _add_saved_text_and_open_for_edit(page)
    page.wait_for_timeout(300)

    # Simulate clicking the Circle toolbar button while text edit is open
    page.evaluate(
        """
        () => {
            const mapCmp = window.ng.getComponent(document.querySelector('app-map'));
            mapCmp.startDrawing('DRAW_CIRCLE');
            if (window.ng?.applyChanges) {
                window.ng.applyChanges(mapCmp);
            }
        }
        """
    )
    page.wait_for_timeout(300)

    visible_after_switch = _entity_visible(page, TEXT_SHAPE_DTO["id"])
    assert visible_after_switch is True, (
        f"B-017 REGRESSION (type-switch): saved Text entity hidden after switching "
        f"to a different draw type (entity.show={visible_after_switch})"
    )


def test_text_shape_entity_visible_after_cm_open_screenshot(page: Page) -> None:
    """
    Same flow as cancel-path test but with a screenshot for visual evidence.
    Entity is hidden during editing (Option A) and restored after cancel.
    """
    _add_saved_text_and_open_for_edit(page)
    page.wait_for_timeout(300)
    _cancel_editing(page)
    page.wait_for_timeout(500)

    page.screenshot(path="e2e-screenshots/b017-text-shape-disappears-after-cancel.png")

    visible = _entity_visible(page, TEXT_SHAPE_DTO["id"])
    assert visible is True, (
        f"BUG B-017: entity.show={visible} — text label still hidden after cancel."
    )
