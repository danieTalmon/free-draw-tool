"""
Helper functions for draw-tool E2E tests.
Each function is a direct port of the TypeScript closure helpers in draw-bugs.spec.ts.

Important: page.evaluate() JS bodies are passed as plain strings (never f-strings)
and dynamic data is always passed as the second argument to avoid { } brace collisions.
"""

from playwright.sync_api import Page


def get_canvas_bounds(page: Page) -> dict:
    """Return the bounding box of the Cesium canvas element."""
    canvas = page.locator("#cesiumContainer canvas").first()
    canvas.wait_for(state="visible")
    bounds = canvas.bounding_box()
    if bounds is None:
        raise RuntimeError("Canvas not found")
    return bounds


def read_point(page: Page, index: int) -> dict:
    """Read a point's longitude/latitude from the Angular form at the given index."""
    return page.evaluate(
        """(pointIndex) => {
            const editCmp = window.ng.getComponent(
                document.querySelector('app-edit-draw')
            );
            const point = editCmp.shapeFormService.pointsArray.at(pointIndex)?.value;
            return {
                longitude: Number(point?.coordinates?.longitude ?? 0),
                latitude:  Number(point?.coordinates?.latitude  ?? 0),
            };
        }""",
        index,
    )


def seed_shape_points(page: Page, points: list) -> None:
    """Set shape positions on the Angular draw tool via window.ng."""
    page.evaluate(
        """(rawPoints) => {
            const mapCmp  = window.ng.getComponent(document.querySelector('app-map'));
            const editCmp = window.ng.getComponent(document.querySelector('app-edit-draw'));
            const facade   = editCmp.shapeFormService;
            const drawTool = mapCmp.drawToolService;

            facade.setPointsFromMapLocations(
                rawPoints.map(([longitude, latitude]) => ({
                    latitude:  { degrees: latitude  },
                    longitude: { degrees: longitude },
                    altitude:  { feet: 0 },
                }))
            );
            drawTool.loadPositionsFromForm();
        }""",
        points,
    )


def drag_current_shape_to(page: Page, target_longitude: float, target_latitude: float) -> None:
    """Simulate a whole-shape drag to the given coordinates."""
    page.evaluate(
        """({ targetLongitude, targetLatitude }) => {
            const mapCmp  = window.ng.getComponent(document.querySelector('app-map'));
            const drawTool = mapCmp.drawToolService;
            const viewer   = mapCmp.viewer;

            const targetCartesian = drawTool.mapLocationToCartesian3({
                latitude:  { degrees: targetLatitude  },
                longitude: { degrees: targetLongitude },
                altitude:  { feet: 0 },
            });
            const targetPoint = viewer.scene.cartesianToCanvasCoordinates(targetCartesian);

            if (!targetPoint) {
                throw new Error('Unable to resolve drag target on screen');
            }

            drawTool.isDraggingWholeShape          = true;
            drawTool.lastDragCartesian             = drawTool.positions[0];
            drawTool.pointerDraggedSinceMouseDown  = false;
            drawTool.handleMouseMove({ endPosition: targetPoint });
            drawTool.handleMouseUp({ position: targetPoint });
        }""",
        {"targetLongitude": target_longitude, "targetLatitude": target_latitude},
    )


def open_saved_shape_for_edit(page: Page, shape_dto: dict) -> None:
    """Add a shape to savedShapesService and immediately open it for editing."""
    page.evaluate(
        """(dto) => {
            const mapCmp = window.ng.getComponent(document.querySelector('app-map'));

            mapCmp.isEditMode = true;
            mapCmp.savedShapesService.addShape(dto);
            const savedShape = mapCmp.savedShapesService.getShapeById(dto.id);

            if (!savedShape) {
                throw new Error('Saved shape ' + dto.id + ' was not added');
            }

            mapCmp['openShapeForEditing'](savedShape);

            if (window.ng?.applyChanges) {
                window.ng.applyChanges(mapCmp);
            }
        }""",
        shape_dto,
    )


def add_saved_shape_and_get_edge_geometry(page: Page, shape_dto: dict) -> dict:
    """
    Add a shape to savedShapesService and return screen-space edge geometry
    (start, end, midpoint, normal) for the first two points.
    """
    return page.evaluate(
        """({ shapeDto: dto }) => {
            const mapCmp             = window.ng.getComponent(document.querySelector('app-map'));
            const savedShapesService = mapCmp.savedShapesService;
            const drawTool           = mapCmp.drawToolService;
            const viewer             = mapCmp.viewer;

            savedShapesService.addShape(dto);

            const positions = dto.points.map((point) =>
                drawTool.mapLocationToCartesian3({
                    latitude:  { degrees: point.coordinates.latitude  },
                    longitude: { degrees: point.coordinates.longitude },
                    altitude:  { feet: point.altitude.feet },
                })
            );

            const start = viewer.scene.cartesianToCanvasCoordinates(positions[0]);
            const end   = viewer.scene.cartesianToCanvasCoordinates(positions[1]);

            if (!start || !end) {
                throw new Error('Unable to resolve saved shape edge on screen');
            }

            const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            const dx     = end.x - start.x;
            const dy     = end.y - start.y;
            const length = Math.hypot(dx, dy) || 1;
            const normal = { x: -dy / length, y: dx / length };

            return { start, end, midpoint, normal };
        }""",
        {"shapeDto": shape_dto},
    )


def right_click_near_saved_shape_hit_area(page: Page, geometry: dict):
    """
    Attempt to trigger a right-click context menu near a saved shape's hit area.
    Tries multiple fractions along the edge and perpendicular offsets.
    Returns { fraction, offset, contextState } on success, or None.
    """
    offsets = [6, -6, 10, -10, 14, -14, 3, -3]
    fractions = [0.25, 0.5, 0.75]

    for fraction in fractions:
        base_x = geometry["start"]["x"] + (geometry["end"]["x"] - geometry["start"]["x"]) * fraction
        base_y = geometry["start"]["y"] + (geometry["end"]["y"] - geometry["start"]["y"]) * fraction

        for offset in offsets:
            point = {
                "x": base_x + geometry["normal"]["x"] * offset,
                "y": base_y + geometry["normal"]["y"] * offset,
            }

            page.evaluate(
                """(position) => {
                    const mapCmp = window.ng.getComponent(document.querySelector('app-map'));
                    mapCmp.closeContextMenu();
                    mapCmp['handleSavedShapeRightClick'](position);
                }""",
                point,
            )

            context_state = page.evaluate(
                """() => {
                    const mapCmp = window.ng.getComponent(document.querySelector('app-map'));
                    return {
                        contextMenuVisible: mapCmp.contextMenuVisible,
                        contextMenuShapeId: mapCmp.contextMenuShape?.shapeDto?.id ?? null,
                    };
                }"""
            )

            if context_state.get("contextMenuVisible"):
                return {"fraction": fraction, "offset": offset, "contextState": context_state}

    return None
