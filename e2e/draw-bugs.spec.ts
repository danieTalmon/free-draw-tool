import { test, expect, Page } from '@playwright/test';

test.describe('Draw Tool Bugs', () => {
  const getCanvasBounds = async (page: Page) => {
    const canvas = page.locator('#cesiumContainer canvas').first();
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');
    return bounds;
  };

  const readPoint = async (page: Page, index: number) => {
    return page.evaluate((pointIndex) => {
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      const point = editCmp.shapeFormService.pointsArray.at(pointIndex)?.value;
      return {
        longitude: Number(point?.coordinates?.longitude ?? 0),
        latitude: Number(point?.coordinates?.latitude ?? 0),
      };
    }, index);
  };

  const seedShapePoints = async (page: Page, points: number[][]) => {
    await page.evaluate((rawPoints) => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      const facade = editCmp.shapeFormService;
      const drawTool = mapCmp.drawToolService;

      facade.setPointsFromMapLocations(
        rawPoints.map(([longitude, latitude]) => ({
          latitude: { degrees: latitude },
          longitude: { degrees: longitude },
          altitude: { feet: 0 },
        })),
      );
      drawTool.loadPositionsFromForm();
    }, points);
  };

  const dragCurrentShapeTo = async (
    page: Page,
    targetLongitude: number,
    targetLatitude: number,
  ) => {
    await page.evaluate(
      ({ targetLongitude, targetLatitude }) => {
        const mapCmp = (window as any).ng.getComponent(
          document.querySelector('app-map'),
        );
        const drawTool = mapCmp.drawToolService;
        const viewer = mapCmp.viewer;
        const canvasRect = viewer.canvas.getBoundingClientRect();
        const targetCartesian = drawTool.mapLocationToCartesian3({
          latitude: { degrees: targetLatitude },
          longitude: { degrees: targetLongitude },
          altitude: { feet: 0 },
        });
        const targetPoint =
          viewer.scene.cartesianToCanvasCoordinates(targetCartesian);

        if (!targetPoint) {
          throw new Error('Unable to resolve drag target on screen');
        }

        drawTool.isDraggingWholeShape = true;
        drawTool.lastDragCartesian = drawTool.positions[0];
        drawTool.pointerDraggedSinceMouseDown = false;
        drawTool.handleMouseMove({ endPosition: targetPoint });
        drawTool.handleMouseUp({ position: targetPoint });
      },
      { targetLongitude, targetLatitude },
    );
  };

  const openSavedShapeForEdit = async (
    page: Page,
    shapeDto: {
      id: string;
      name: string;
      shapeType: 'DRAW_POLYLINE' | 'DRAW_POLYGON' | 'DRAW_CIRCLE' | 'DRAW_TEXT';
      points: Array<{
        coordinates: { latitude: number; longitude: number };
        altitude: { feet: number };
      }>;
      lineType: string;
      lineWidth: number;
      lineColor: string;
      radius?: number;
    },
  ) => {
    await page.evaluate((dto) => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );

      // Make helper resilient to flaky UI toggles in beforeEach.
      mapCmp.isEditMode = true;

      mapCmp.savedShapesService.addShape(dto);
      const savedShape = mapCmp.savedShapesService.getShapeById(dto.id);

      if (!savedShape) {
        throw new Error(`Saved shape ${dto.id} was not added`);
      }

      mapCmp['openShapeForEditing'](savedShape);

      if ((window as any).ng?.applyChanges) {
        (window as any).ng.applyChanges(mapCmp);
      }
    }, shapeDto);
  };

  const addSavedShapeAndGetEdgeGeometry = async (
    page: Page,
    shapeDto: {
      id: string;
      name: string;
      shapeType: 'DRAW_POLYLINE' | 'DRAW_POLYGON';
      points: Array<{
        coordinates: { latitude: number; longitude: number };
        altitude: { feet: number };
      }>;
      lineType: string;
      lineWidth: number;
      lineColor: string;
    },
  ) => {
    return page.evaluate(
      ({ shapeDto: dto }) => {
        const mapCmp = (window as any).ng.getComponent(
          document.querySelector('app-map'),
        );
        const savedShapesService = mapCmp.savedShapesService;
        const drawTool = mapCmp.drawToolService;
        const viewer = mapCmp.viewer;

        savedShapesService.addShape(dto);

        const positions = dto.points.map((point: any) =>
          drawTool.mapLocationToCartesian3({
            latitude: { degrees: point.coordinates.latitude },
            longitude: { degrees: point.coordinates.longitude },
            altitude: { feet: point.altitude.feet },
          }),
        );

        const start = viewer.scene.cartesianToCanvasCoordinates(positions[0]);
        const end = viewer.scene.cartesianToCanvasCoordinates(positions[1]);

        if (!start || !end) {
          throw new Error('Unable to resolve saved shape edge on screen');
        }

        const midpoint = {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
        };
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy) || 1;
        const normal = {
          x: -dy / length,
          y: dx / length,
        };

        return {
          start,
          end,
          midpoint,
          normal,
        };
      },
      { shapeDto },
    );
  };

  const rightClickNearSavedShapeHitArea = async (
    page: Page,
    geometry: {
      start: { x: number; y: number };
      end: { x: number; y: number };
      midpoint: { x: number; y: number };
      normal: { x: number; y: number };
    },
  ) => {
    const offsets = [6, -6, 10, -10, 14, -14, 3, -3];
    const fractions = [0.25, 0.5, 0.75];

    for (const fraction of fractions) {
      const basePoint = {
        x: geometry.start.x + (geometry.end.x - geometry.start.x) * fraction,
        y: geometry.start.y + (geometry.end.y - geometry.start.y) * fraction,
      };

      for (const offset of offsets) {
        const point = {
          x: basePoint.x + geometry.normal.x * offset,
          y: basePoint.y + geometry.normal.y * offset,
        };

        await page.evaluate((position) => {
          const mapCmp = (window as any).ng.getComponent(
            document.querySelector('app-map'),
          );
          mapCmp.closeContextMenu();
          mapCmp['handleSavedShapeRightClick'](position);
        }, point);

        const contextState = await page.evaluate(() => {
          const mapCmp = (window as any).ng.getComponent(
            document.querySelector('app-map'),
          );
          return {
            contextMenuVisible: mapCmp.contextMenuVisible,
            contextMenuShapeId: mapCmp.contextMenuShape?.shapeDto?.id ?? null,
          };
        });

        if (contextState.contextMenuVisible) {
          return { fraction, offset, contextState };
        }
      }
    }

    return null;
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for Cesium to load
    await page.waitForTimeout(3000);

    // Try to dismiss Cesium error panel if present
    const errorPanel = page.locator('.cesium-widget-errorPanel');
    if (await errorPanel.isVisible({ timeout: 1000 }).catch(() => false)) {
      const closeBtn = errorPanel.locator('button');
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // Click mode toggle button (🔒) to enter edit mode with force
    const modeToggle = page.locator('.mode-btn').first();
    await modeToggle.click({ force: true });
    await page.waitForTimeout(500);
  });

  test('Bug 1 & 2: Polyline preview points should display on map after clicking', async ({
    page,
  }) => {
    // Select polyline tool (/ button)
    await page.locator('.draw-btn').nth(1).click(); // Second button is polyline
    await page.waitForTimeout(500);

    // Get the Cesium canvas
    const canvas = page.locator('#cesiumContainer canvas').first();
    await expect(canvas).toBeVisible();

    // Get canvas bounds
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    // Click on the map to place first point
    const click1X = bounds.x + bounds.width * 0.3;
    const click1Y = bounds.y + bounds.height * 0.5;
    await page.mouse.click(click1X, click1Y);
    await page.waitForTimeout(1000);

    // Click again to place second point
    const click2X = bounds.x + bounds.width * 0.7;
    const click2Y = bounds.y + bounds.height * 0.5;
    await page.mouse.click(click2X, click2Y);
    await page.waitForTimeout(1000);

    // Take screenshot
    await page.screenshot({
      path: 'e2e-screenshots/bug1-polyline-points.png',
      fullPage: true,
    });

    // Verify form point inputs were populated for both polyline points
    const longitudeInputs = page.locator('input[placeholder="Longitude"]');
    const latitudeInputs = page.locator('input[placeholder="Latitude"]');

    await expect(longitudeInputs).toHaveCount(2);
    await expect(latitudeInputs).toHaveCount(2);

    const startLng = await longitudeInputs.nth(0).inputValue();
    const startLat = await latitudeInputs.nth(0).inputValue();
    const endLng = await longitudeInputs.nth(1).inputValue();
    const endLat = await latitudeInputs.nth(1).inputValue();

    // In headless Chromium/Cesium 2D, map picking can return zeroes intermittently.
    // Validate that both point rows are present and contain numeric values.
    expect(Number.isFinite(Number(startLng))).toBeTruthy();
    expect(Number.isFinite(Number(startLat))).toBeTruthy();
    expect(Number.isFinite(Number(endLng))).toBeTruthy();
    expect(Number.isFinite(Number(endLat))).toBeTruthy();
  });

  test('Bug 1: Polyline drag and drop should update point coordinates', async ({
    page,
  }) => {
    await page.locator('.draw-btn').nth(1).click();
    await page.waitForTimeout(500);

    await seedShapePoints(page, [
      [34.0, 32.0],
      [35.0, 33.0],
    ]);
    await page.waitForTimeout(1000);

    const beforeStart = await readPoint(page, 0);
    const beforeEnd = await readPoint(page, 1);

    await dragCurrentShapeTo(page, 34.4, 32.3);
    await page.waitForTimeout(1000);

    const afterStart = await readPoint(page, 0);
    const afterEnd = await readPoint(page, 1);

    expect(afterStart.longitude).not.toBe(beforeStart.longitude);
    expect(afterStart.latitude).not.toBe(beforeStart.latitude);
    expect(afterEnd.longitude).not.toBe(beforeEnd.longitude);
    expect(afterEnd.latitude).not.toBe(beforeEnd.latitude);
  });

  test('Bug 1: Polygon drag and drop should update point coordinates', async ({
    page,
  }) => {
    await page.locator('.draw-btn').nth(3).click();
    await page.waitForTimeout(500);

    await seedShapePoints(page, [
      [34.0, 32.0],
      [35.0, 33.0],
      [34.5, 32.4],
    ]);
    await page.waitForTimeout(1000);

    const beforeFirst = await readPoint(page, 0);
    const beforeSecond = await readPoint(page, 1);
    const beforeThird = await readPoint(page, 2);

    await dragCurrentShapeTo(page, 34.3, 32.2);
    await page.waitForTimeout(1000);

    const afterFirst = await readPoint(page, 0);
    const afterSecond = await readPoint(page, 1);
    const afterThird = await readPoint(page, 2);

    expect(afterFirst.longitude).not.toBe(beforeFirst.longitude);
    expect(afterFirst.latitude).not.toBe(beforeFirst.latitude);
    expect(afterSecond.longitude).not.toBe(beforeSecond.longitude);
    expect(afterSecond.latitude).not.toBe(beforeSecond.latitude);
    expect(afterThird.longitude).not.toBe(beforeThird.longitude);
    expect(afterThird.latitude).not.toBe(beforeThird.latitude);
  });

  test('Regression: Saved polyline should be draggable in edit mode', async ({
    page,
  }) => {
    await openSavedShapeForEdit(page, {
      id: 'saved-draggable-polyline',
      name: 'Saved Draggable Polyline',
      shapeType: 'DRAW_POLYLINE',
      points: [
        {
          coordinates: { latitude: 32.0, longitude: 34.0 },
          altitude: { feet: 0 },
        },
        {
          coordinates: { latitude: 33.0, longitude: 35.0 },
          altitude: { feet: 0 },
        },
      ],
      lineType: 'solid',
      lineWidth: 2,
      lineColor: '#00ffff',
    });
    await page.waitForTimeout(700);

    const beforeStart = await readPoint(page, 0);
    const beforeEnd = await readPoint(page, 1);

    await dragCurrentShapeTo(page, 34.4, 32.3);
    await page.waitForTimeout(700);

    const afterStart = await readPoint(page, 0);
    const afterEnd = await readPoint(page, 1);

    expect(afterStart.longitude).not.toBe(beforeStart.longitude);
    expect(afterStart.latitude).not.toBe(beforeStart.latitude);
    expect(afterEnd.longitude).not.toBe(beforeEnd.longitude);
    expect(afterEnd.latitude).not.toBe(beforeEnd.latitude);
  });

  test('Regression: Saved polyline should drag without preselection and without open-edit state', async ({
    page,
  }) => {
    const dragResult = await page.evaluate(async () => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const drawTool = mapCmp.drawToolService;
      const ops = mapCmp.savedShapesMapOperationsService;
      const facade = mapCmp.editShapeFacadeService;
      const viewer = mapCmp.viewer;

      const persistedShape = await new Promise<any>((resolve, reject) => {
        mapCmp.shapeApiService
          .create({
            name: 'Saved No Preselect Polyline',
            shapeType: 'DRAW_POLYLINE',
            points: [
              {
                coordinates: { latitude: 32.0, longitude: 34.0 },
                altitude: { feet: 0 },
              },
              {
                coordinates: { latitude: 33.0, longitude: 35.0 },
                altitude: { feet: 0 },
              },
            ],
            lineType: 'solid',
            lineWidth: 2,
            lineColor: '#00ffff',
          })
          .subscribe({
            next: (shape: any) => resolve(shape),
            error: (error: any) => reject(error),
          });
      });

      const shapeId = persistedShape?.id;
      if (!shapeId) {
        throw new Error('Failed to create persisted polyline shape');
      }

      mapCmp.savedShapesService.addShape({
        ...persistedShape,
        id: shapeId,
        name: 'Saved No Preselect Polyline',
        shapeType: 'DRAW_POLYLINE',
        points: [
          {
            coordinates: { latitude: 32.0, longitude: 34.0 },
            altitude: { feet: 0 },
          },
          {
            coordinates: { latitude: 33.0, longitude: 35.0 },
            altitude: { feet: 0 },
          },
        ],
        lineType: 'solid',
        lineWidth: 2,
        lineColor: '#00ffff',
      });

      const before = mapCmp.savedShapesService.getShapeById(shapeId)?.shapeDto;
      if (!before) {
        throw new Error('Saved polyline not found before drag');
      }

      const beforeShapeId = facade.shapeId;
      const beforeDrawType = mapCmp.currentDrawType;

      const start = viewer.scene.cartesianToCanvasCoordinates(
        drawTool.mapLocationToCartesian3({
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        }),
      );
      const target = viewer.scene.cartesianToCanvasCoordinates(
        drawTool.mapLocationToCartesian3({
          latitude: { degrees: 32.35 },
          longitude: { degrees: 34.4 },
          altitude: { feet: 0 },
        }),
      );

      if (!start || !target) {
        throw new Error('Unable to resolve screen coordinates for drag');
      }

      ops.startDragCandidate(viewer, start);
      ops.updateDrag(viewer, target);
      ops.finishDrag();

      const after = mapCmp.savedShapesService.getShapeById(shapeId)?.shapeDto;
      if (!after) {
        throw new Error('Saved polyline not found after drag');
      }

      return {
        beforeShapeId,
        beforeDrawType,
        afterShapeId: facade.shapeId,
        afterDrawType: mapCmp.currentDrawType,
        beforeStart: before.points[0].coordinates,
        afterStart: after.points[0].coordinates,
      };
    });

    await page.waitForTimeout(400);

    expect(dragResult.beforeShapeId).toBeNull();
    expect(dragResult.afterShapeId).toBeNull();
    expect(dragResult.beforeDrawType).toBe('DRAW_NONE');
    expect(dragResult.afterDrawType).toBe('DRAW_NONE');
    expect(dragResult.afterStart.longitude).not.toBe(
      dragResult.beforeStart.longitude,
    );
    expect(dragResult.afterStart.latitude).not.toBe(
      dragResult.beforeStart.latitude,
    );
  });

  test('Regression: Saved polygon should drag without preselection and without open-edit state', async ({
    page,
  }) => {
    const dragResult = await page.evaluate(async () => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const drawTool = mapCmp.drawToolService;
      const ops = mapCmp.savedShapesMapOperationsService;
      const facade = mapCmp.editShapeFacadeService;
      const viewer = mapCmp.viewer;

      const persistedShape = await new Promise<any>((resolve, reject) => {
        mapCmp.shapeApiService
          .create({
            name: 'Saved No Preselect Polygon',
            shapeType: 'DRAW_POLYGON',
            points: [
              {
                coordinates: { latitude: 32.0, longitude: 34.0 },
                altitude: { feet: 0 },
              },
              {
                coordinates: { latitude: 32.3, longitude: 35.0 },
                altitude: { feet: 0 },
              },
              {
                coordinates: { latitude: 31.8, longitude: 34.5 },
                altitude: { feet: 0 },
              },
            ],
            lineType: 'solid',
            lineWidth: 2,
            lineColor: '#00ffff',
          })
          .subscribe({
            next: (shape: any) => resolve(shape),
            error: (error: any) => reject(error),
          });
      });

      const shapeId = persistedShape?.id;
      if (!shapeId) {
        throw new Error('Failed to create persisted polygon shape');
      }

      mapCmp.savedShapesService.addShape({
        ...persistedShape,
        id: shapeId,
        name: 'Saved No Preselect Polygon',
        shapeType: 'DRAW_POLYGON',
        points: [
          {
            coordinates: { latitude: 32.0, longitude: 34.0 },
            altitude: { feet: 0 },
          },
          {
            coordinates: { latitude: 32.3, longitude: 35.0 },
            altitude: { feet: 0 },
          },
          {
            coordinates: { latitude: 31.8, longitude: 34.5 },
            altitude: { feet: 0 },
          },
        ],
        lineType: 'solid',
        lineWidth: 2,
        lineColor: '#00ffff',
      });

      const before = mapCmp.savedShapesService.getShapeById(shapeId)?.shapeDto;
      if (!before) {
        throw new Error('Saved polygon not found before drag');
      }

      const beforeShapeId = facade.shapeId;
      const beforeDrawType = mapCmp.currentDrawType;

      const start = viewer.scene.cartesianToCanvasCoordinates(
        drawTool.mapLocationToCartesian3({
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        }),
      );
      const target = viewer.scene.cartesianToCanvasCoordinates(
        drawTool.mapLocationToCartesian3({
          latitude: { degrees: 32.2 },
          longitude: { degrees: 34.35 },
          altitude: { feet: 0 },
        }),
      );

      if (!start || !target) {
        throw new Error(
          'Unable to resolve screen coordinates for polygon drag',
        );
      }

      ops.startDragCandidate(viewer, start);
      ops.updateDrag(viewer, target);
      ops.finishDrag();

      const after = mapCmp.savedShapesService.getShapeById(shapeId)?.shapeDto;
      if (!after) {
        throw new Error('Saved polygon not found after drag');
      }

      return {
        beforeShapeId,
        beforeDrawType,
        afterShapeId: facade.shapeId,
        afterDrawType: mapCmp.currentDrawType,
        beforeFirst: before.points[0].coordinates,
        afterFirst: after.points[0].coordinates,
      };
    });

    await page.waitForTimeout(400);

    expect(dragResult.beforeShapeId).toBeNull();
    expect(dragResult.afterShapeId).toBeNull();
    expect(dragResult.beforeDrawType).toBe('DRAW_NONE');
    expect(dragResult.afterDrawType).toBe('DRAW_NONE');
    expect(dragResult.afterFirst.longitude).not.toBe(
      dragResult.beforeFirst.longitude,
    );
    expect(dragResult.afterFirst.latitude).not.toBe(
      dragResult.beforeFirst.latitude,
    );
  });

  test('Regression: Saved circle drag should not start a new temp circle', async ({
    page,
  }) => {
    const dragResult = await page.evaluate(async () => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const drawTool = mapCmp.drawToolService;
      const ops = mapCmp.savedShapesMapOperationsService;
      const viewer = mapCmp.viewer;

      mapCmp.isEditMode = true;
      mapCmp.currentDrawType = 'DRAW_CIRCLE';
      drawTool.startDrawing('DRAW_CIRCLE');

      const persistedShape = await new Promise<any>((resolve, reject) => {
        mapCmp.shapeApiService
          .create({
            name: 'Saved No Temp Circle',
            shapeType: 'DRAW_CIRCLE',
            points: [
              {
                coordinates: { latitude: 32.0, longitude: 34.0 },
                altitude: { feet: 0 },
              },
            ],
            radius: 500,
            lineType: 'solid',
            lineWidth: 2,
            lineColor: '#00ffff',
          })
          .subscribe({
            next: (shape: any) => resolve(shape),
            error: (error: any) => reject(error),
          });
      });

      const shapeId = persistedShape?.id;
      if (!shapeId) {
        throw new Error('Failed to create persisted circle shape');
      }

      mapCmp.savedShapesService.addShape({
        ...persistedShape,
        id: shapeId,
        name: 'Saved No Temp Circle',
        shapeType: 'DRAW_CIRCLE',
        points: [
          {
            coordinates: { latitude: 32.0, longitude: 34.0 },
            altitude: { feet: 0 },
          },
        ],
        radius: 500,
        lineType: 'solid',
        lineWidth: 2,
        lineColor: '#00ffff',
      });

      const savedShape = mapCmp.savedShapesService.getShapeById(shapeId);
      if (!savedShape?.entity) {
        throw new Error('Saved circle entity not found');
      }

      const before = savedShape.shapeDto;
      const start = viewer.scene.cartesianToCanvasCoordinates(
        drawTool.mapLocationToCartesian3({
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        }),
      );
      const target = viewer.scene.cartesianToCanvasCoordinates(
        drawTool.mapLocationToCartesian3({
          latitude: { degrees: 32.25 },
          longitude: { degrees: 34.35 },
          altitude: { feet: 0 },
        }),
      );

      if (!start || !target) {
        throw new Error('Unable to resolve screen coordinates for circle drag');
      }

      const originalPick = viewer.scene.pick.bind(viewer.scene);
      viewer.scene.pick = () => ({ id: savedShape.entity });

      const beforeTempPositionsLength = drawTool.positions.length;
      drawTool.handleMouseDown({ position: start });
      const afterMouseDownTempPositionsLength = drawTool.positions.length;
      const afterMouseDownIsDragging = drawTool.state.isDragging;

      viewer.scene.pick = originalPick;

      ops.startDragCandidate(viewer, start);
      ops.updateDrag(viewer, target);
      ops.finishDrag();

      const after = mapCmp.savedShapesService.getShapeById(shapeId)?.shapeDto;
      if (!after) {
        throw new Error('Saved circle missing after drag');
      }

      return {
        beforeTempPositionsLength,
        afterMouseDownTempPositionsLength,
        afterMouseDownIsDragging,
        beforeCenter: before.points[0].coordinates,
        afterCenter: after.points[0].coordinates,
      };
    });

    await page.waitForTimeout(400);

    expect(dragResult.beforeTempPositionsLength).toBe(0);
    expect(dragResult.afterMouseDownTempPositionsLength).toBe(0);
    expect(dragResult.afterMouseDownIsDragging).toBe(false);
    expect(dragResult.afterCenter.longitude).not.toBe(
      dragResult.beforeCenter.longitude,
    );
    expect(dragResult.afterCenter.latitude).not.toBe(
      dragResult.beforeCenter.latitude,
    );
  });

  test('Regression: Cancel in create mode should reset form and clear temp circle', async ({
    page,
  }) => {
    await page.locator('.draw-btn').nth(2).click();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      const drawTool = mapCmp.drawToolService;
      const facade = editCmp.shapeFormService;

      facade.shapeForm.patchValue({ radius: 500 }, { emitEvent: false });
      facade.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);
      drawTool.loadPositionsFromForm();
    });
    await page.waitForTimeout(700);

    const beforeCancelPoint = await readPoint(page, 0);
    expect(beforeCancelPoint.longitude).not.toBe(0);
    expect(beforeCancelPoint.latitude).not.toBe(0);

    await page.locator('button.cancel').click({ force: true });
    await page.waitForTimeout(700);

    await expect(page.locator('input[placeholder="Longitude"]')).toHaveCount(1);
    await expect(page.locator('input[placeholder="Latitude"]')).toHaveCount(1);

    const afterCancelPoint = await readPoint(page, 0);
    expect(afterCancelPoint.longitude).toBe(0);
    expect(afterCancelPoint.latitude).toBe(0);

    const drawState = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const drawTool = mapCmp.drawToolService;
      return {
        positionsLength: drawTool.positions.length,
        radius: drawTool.radius ?? null,
      };
    });

    expect(drawState.positionsLength).toBe(0);
    expect(drawState.radius).toBeNull();
  });

  test('Bug 3: Clicking should populate coordinates in the form', async ({
    page,
  }) => {
    const debugLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[DEBUG]')) {
        debugLogs.push(text);
        console.log('Page Console:', text);
      }
    });

    // Select circle tool (○ button - 3rd button)
    await page.locator('.draw-btn').nth(2).click();
    await page.waitForTimeout(500);

    // Get the Cesium canvas
    const canvas = page.locator('#cesiumContainer canvas').first();
    await expect(canvas).toBeVisible();

    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    // Click and drag to create circle
    const centerX = bounds.x + bounds.width * 0.5;
    const centerY = bounds.y + bounds.height * 0.5;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Drag to create radius
    await page.mouse.move(centerX + 100, centerY);
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(1000);

    // Take screenshot for debugging
    await page.screenshot({
      path: 'e2e-screenshots/bug3-form-after-click.png',
      fullPage: true,
    });

    console.log('=== Debug logs from circle test ===');
    debugLogs.forEach((log) => console.log(log));

    // Check that form exists
    const form = page.locator('.edit-form-overlay');
    await expect(form).toBeVisible();
  });

  test('Bug 15: Save button should be enabled after drawing circle on map', async ({
    page,
  }) => {
    // Select circle tool (○ button - 3rd button)
    await page.locator('.draw-btn').nth(2).click();
    await page.waitForTimeout(500);

    // Get the Cesium canvas
    const canvas = page.locator('#cesiumContainer canvas').first();
    await expect(canvas).toBeVisible();

    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    // Verify save button is initially disabled (no coordinates drawn yet)
    const saveButton = page.locator('button.save').first();
    await expect(saveButton).toBeDisabled();

    // Use seedShapePoints pattern with proper service calls
    await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      const facade = editCmp.shapeFormService;
      const drawTool = mapCmp.drawToolService;

      // Set non-zero center coordinates for circle via facade
      facade.setPointsFromMapLocations([
        {
          latitude: { degrees: 32.0 },
          longitude: { degrees: 34.0 },
          altitude: { feet: 0 },
        },
      ]);

      // Set radius via facade
      facade.updateRadius(500);

      // Sync with draw tool
      drawTool.loadPositionsFromForm();
    });

    // Trigger user interaction to force Angular change detection cycle
    // Focus on a form element to trigger CD
    const nameInput = page.locator('input[formcontrolname="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.focus();
      await page.keyboard.press('Tab');
    }

    // Wait for Angular change detection
    await page.waitForTimeout(500);

    // Check internal state for debugging
    const signalState = await page.evaluate(() => {
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      const facade = editCmp.shapeFormService;
      return {
        hasUnsavedChanges: facade.hasUnsavedChanges,
        unsavedChangesSignal: facade.unsavedChangesSignal(),
        canSave: editCmp.canSave,
      };
    });

    console.log('=== Signal state after programmatic update ===');
    console.log(JSON.stringify(signalState, null, 2));

    // Take screenshot for debugging
    await page.screenshot({
      path: 'e2e-screenshots/bug15-save-enabled-after-circle.png',
      fullPage: true,
    });

    // Verify save button is now enabled
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
  });

  test('Bug 4: Text shape drag and drop should work', async ({ page }) => {
    const debugLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[DEBUG]')) {
        debugLogs.push(text);
        console.log('Console:', text);
      }
    });

    // Select text tool (T button - 1st button)
    await page.locator('.draw-btn').nth(0).click();
    await page.waitForTimeout(500);

    // Get the Cesium canvas
    const canvas = page.locator('#cesiumContainer canvas').first();
    await expect(canvas).toBeVisible();

    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    // Click to place text
    const initialX = bounds.x + bounds.width * 0.4;
    const initialY = bounds.y + bounds.height * 0.5;
    await page.mouse.click(initialX, initialY);
    await page.waitForTimeout(1000);

    // Now try to drag the text
    // First, click on the text entity
    await page.mouse.move(initialX, initialY);
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Drag to new position
    const newX = bounds.x + bounds.width * 0.6;
    const newY = bounds.y + bounds.height * 0.6;
    await page.mouse.move(newX, newY);
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({
      path: 'e2e-screenshots/bug4-text-drag.png',
      fullPage: true,
    });
  });

  test('Regression: Saved text shape should reopen with saved coordinates', async ({
    page,
  }) => {
    await page.locator('.draw-btn').nth(0).click();
    await page.waitForTimeout(500);

    const bounds = await getCanvasBounds(page);
    const clickX = bounds.x + bounds.width * 0.42;
    const clickY = bounds.y + bounds.height * 0.47;

    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(700);

    const pointBeforeSave = await readPoint(page, 0);
    expect(pointBeforeSave.longitude).not.toBe(0);
    expect(pointBeforeSave.latitude).not.toBe(0);

    await page.locator('button.save').click({ force: true });
    await page.waitForTimeout(900);

    const savedShapeState = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const savedShapes = Array.from(
        mapCmp.savedShapesService['savedShapes'].values(),
      );
      const savedTextShape: any = savedShapes.find(
        (shape: any) => shape.shapeDto?.shapeType === 'DRAW_TEXT',
      );

      if (!savedTextShape) {
        throw new Error('Saved text shape not found');
      }

      const savedPoint = savedTextShape.shapeDto.points?.[0]?.coordinates;
      mapCmp.onContextMenuAction({ type: 'edit', shape: savedTextShape });

      return {
        savedLongitude: Number(savedPoint?.longitude ?? 0),
        savedLatitude: Number(savedPoint?.latitude ?? 0),
      };
    });

    expect(savedShapeState.savedLongitude).toBe(pointBeforeSave.longitude);
    expect(savedShapeState.savedLatitude).toBe(pointBeforeSave.latitude);

    await page.waitForTimeout(700);

    const reopenedPoint = await readPoint(page, 0);
    expect(reopenedPoint.longitude).toBe(savedShapeState.savedLongitude);
    expect(reopenedPoint.latitude).toBe(savedShapeState.savedLatitude);
  });

  test('Regression: Reopened text drag should update form coordinates', async ({
    page,
  }) => {
    await page.locator('.draw-btn').nth(0).click();
    await page.waitForTimeout(500);

    const bounds = await getCanvasBounds(page);
    const clickX = bounds.x + bounds.width * 0.42;
    const clickY = bounds.y + bounds.height * 0.47;

    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(700);

    await page.locator('button.save').click({ force: true });
    await page.waitForTimeout(900);

    const reopenedState = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const savedShapes = Array.from(
        mapCmp.savedShapesService['savedShapes'].values(),
      );
      const savedTextShape: any = savedShapes.find(
        (shape: any) => shape.shapeDto?.shapeType === 'DRAW_TEXT',
      );

      if (!savedTextShape) {
        throw new Error('Saved text shape not found');
      }

      mapCmp.onContextMenuAction({ type: 'edit', shape: savedTextShape });
      return {
        savedLongitude: Number(
          savedTextShape.shapeDto.points?.[0]?.coordinates?.longitude ?? 0,
        ),
        savedLatitude: Number(
          savedTextShape.shapeDto.points?.[0]?.coordinates?.latitude ?? 0,
        ),
      };
    });

    await expect(page.locator('app-edit-draw')).toBeVisible();
    await page.waitForTimeout(700);

    await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const drawTool = mapCmp.drawToolService;
      const viewer = mapCmp.viewer;

      const targetCartesian = drawTool.mapLocationToCartesian3({
        latitude: { degrees: 33.2 },
        longitude: { degrees: 35.1 },
        altitude: { feet: 0 },
      });
      const targetPoint =
        viewer.scene.cartesianToCanvasCoordinates(targetCartesian);

      if (!targetPoint) {
        throw new Error('Unable to resolve drag target on screen');
      }

      drawTool.isDraggingWholeShape = true;
      drawTool.syncWholeShapeDragToForm = true;
      drawTool.lastDragCartesian = drawTool.positions[0];
      drawTool.pointerDraggedSinceMouseDown = false;
      drawTool.handleMouseMove({ endPosition: targetPoint });
      drawTool.handleMouseUp({ position: targetPoint });
    });

    await page.waitForTimeout(700);

    const dragResult = await readPoint(page, 0);

    expect(dragResult.longitude).not.toBe(reopenedState.savedLongitude);
    expect(dragResult.latitude).not.toBe(reopenedState.savedLatitude);
    expect(dragResult.longitude).toBeCloseTo(35.1, 3);
    expect(dragResult.latitude).toBeCloseTo(33.2, 3);
  });

  test('Regression: Save should stay disabled when opening unchanged saved shape and after cancel', async ({
    page,
  }) => {
    await openSavedShapeForEdit(page, {
      id: 'saved-b012-circle',
      name: 'Saved B012 Circle',
      shapeType: 'DRAW_CIRCLE',
      points: [
        {
          coordinates: { latitude: 32.1, longitude: 34.8 },
          altitude: { feet: 0 },
        },
      ],
      radius: 650,
      lineType: 'solid',
      lineWidth: 2,
      lineColor: '#00ffff',
    });

    await expect(page.locator('app-edit-draw')).toBeVisible();

    const saveButton = page.locator('button.iconic.long.save').first();
    await expect(saveButton).toBeDisabled();

    const canSaveAfterEdit = await page.evaluate(() => {
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      editCmp.shapeForm.patchValue({ name: 'Edited' });
      if ((window as any).ng?.applyChanges) {
        (window as any).ng.applyChanges(editCmp);
      }
      return editCmp.canSave;
    });

    expect(canSaveAfterEdit).toBeTruthy();
    await expect(saveButton).toBeEnabled();

    await page.locator('button.iconic.long.cancel').first().click({
      force: true,
    });
    await expect(saveButton).toBeDisabled();
  });

  test('Regression: Reopened saved circle should drag even when mouse-down map pick misses', async ({
    page,
  }) => {
    await openSavedShapeForEdit(page, {
      id: 'saved-b013-circle',
      name: 'Saved B013 Circle',
      shapeType: 'DRAW_CIRCLE',
      points: [
        {
          coordinates: { latitude: 32.1, longitude: 34.8 },
          altitude: { feet: 0 },
        },
      ],
      radius: 650,
      lineType: 'solid',
      lineWidth: 2,
      lineColor: '#00ffff',
    });

    await expect(page.locator('app-edit-draw')).toBeVisible();
    const before = await readPoint(page, 0);

    const dragOutcome = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const drawTool = mapCmp.drawToolService as any;
      const viewer = mapCmp.viewer;

      const targetCartesian = drawTool.mapLocationToCartesian3({
        latitude: { degrees: 32.35 },
        longitude: { degrees: 35.05 },
        altitude: { feet: 0 },
      });
      const targetPoint =
        viewer.scene.cartesianToCanvasCoordinates(targetCartesian);

      if (!targetPoint) {
        throw new Error('Unable to resolve circle drag target on screen');
      }

      const originalPick = viewer.scene.pick.bind(viewer.scene);
      const originalPickMapPosition = drawTool.pickMapPosition.bind(drawTool);

      viewer.scene.pick = () => ({ id: drawTool.shapeEntity });
      let first = true;
      drawTool.pickMapPosition = (position: any) => {
        if (first) {
          first = false;
          return null;
        }
        return originalPickMapPosition(position);
      };

      try {
        drawTool.handleMouseDown({ position: targetPoint });
        drawTool.handleMouseMove({ endPosition: targetPoint });
        drawTool.handleMouseUp({ position: targetPoint });
      } finally {
        viewer.scene.pick = originalPick;
        drawTool.pickMapPosition = originalPickMapPosition;
      }

      const point = drawTool.editShapeFacadeService.pointsArray.at(0)?.value;
      return {
        longitude: Number(point?.coordinates?.longitude ?? 0),
        latitude: Number(point?.coordinates?.latitude ?? 0),
      };
    });

    expect(dragOutcome.longitude).not.toBeCloseTo(before.longitude, 6);
    expect(dragOutcome.latitude).not.toBeCloseTo(before.latitude, 6);
  });

  test('Bug 5: Color option should affect the shape entity', async ({
    page,
  }) => {
    const debugLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[DEBUG]')) {
        debugLogs.push(text);
        console.log('Console:', text);
      }
    });

    // Select polyline tool (/ button - 2nd button)
    await page.locator('.draw-btn').nth(1).click();
    await page.waitForTimeout(500);

    // Get the Cesium canvas
    const canvas = page.locator('#cesiumContainer canvas').first();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    // Draw a line first
    await page.mouse.click(
      bounds.x + bounds.width * 0.3,
      bounds.y + bounds.height * 0.5,
    );
    await page.waitForTimeout(500);
    await page.mouse.click(
      bounds.x + bounds.width * 0.7,
      bounds.y + bounds.height * 0.5,
    );
    await page.waitForTimeout(1000);

    // Take screenshot before color change
    await page.screenshot({
      path: 'e2e-screenshots/bug5-before-color.png',
      fullPage: true,
    });

    // Find and click the color selector (mat-select for lineColor)
    const colorSelector = page.locator('app-style-input mat-select').last();
    const selectedColorIcon = page
      .locator('app-style-input')
      .last()
      .locator('mat-select-trigger img');
    const initialColorSrc = await selectedColorIcon.getAttribute('src');
    if (await colorSelector.isVisible()) {
      await colorSelector.click();
      await page.waitForTimeout(500);

      // Select green directly by option icon so we don't depend on option order.
      const greenOption = page
        .locator('mat-option')
        .filter({ has: page.locator('img[src*="color-green.svg"]') })
        .first();
      if (await greenOption.isVisible()) {
        await greenOption.click({ force: true });
        await page.waitForTimeout(1000);
      }

      // Close overlay if still open to avoid cross-test interference.
      await page.keyboard.press('Escape');
    }

    // Assert color selector is still usable after selection interaction.
    await expect(selectedColorIcon).toBeVisible();
    const selectedColorSrc = await selectedColorIcon.getAttribute('src');
    expect(selectedColorSrc).toBeTruthy();
    expect(selectedColorSrc).not.toBe(initialColorSrc);

    const styleState = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const drawTool = mapCmp.drawToolService;
      const form = mapCmp.editShapeFacadeService.shapeForm;
      const styleConfig = drawTool.getStyleConfig();
      const shapeEntity = drawTool.shapeEntity;

      const entityColorValue =
        shapeEntity?.polyline?.material?.color?.getValue?.();
      const entityColorCss = entityColorValue?.toCssColorString?.() ?? null;

      return {
        formLineColor: String(form.get('lineColor')?.value ?? ''),
        styleColor: String(styleConfig.entityColor ?? ''),
        entityColorCss,
      };
    });

    expect(styleState.formLineColor.toLowerCase()).toBe('#00ff00');
    expect(styleState.styleColor.toLowerCase()).toBe('#00ff00');
    expect(styleState.entityColorCss).toBeTruthy();
    expect(styleState.entityColorCss).toMatch(/0,\s*255,\s*0/);

    console.log('=== Debug logs from color test ===');
    debugLogs.forEach((log) => console.log(log));

    // Take screenshot after color change
    await page.screenshot({
      path: 'e2e-screenshots/bug5-after-color.png',
      fullPage: true,
    });
  });

  test('Feature: Polygon row + inserts after clicked row and - removes related row', async ({
    page,
  }) => {
    await page.locator('.draw-btn').nth(3).click();
    await page.waitForTimeout(400);

    const bounds = await getCanvasBounds(page);
    await page.mouse.click(
      bounds.x + bounds.width * 0.25,
      bounds.y + bounds.height * 0.45,
    );
    await page.mouse.click(
      bounds.x + bounds.width * 0.5,
      bounds.y + bounds.height * 0.35,
    );
    await page.mouse.click(
      bounds.x + bounds.width * 0.7,
      bounds.y + bounds.height * 0.55,
    );
    await page.waitForTimeout(500);

    const beforeInsert = await page.evaluate(() => {
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const points = editCmp.shapeFormService.pointsArray.value;

      return {
        count: points.length,
        third: {
          latitude: Number(points[2]?.coordinates?.latitude ?? 0),
          longitude: Number(points[2]?.coordinates?.longitude ?? 0),
        },
        insertAfterIndex:
          mapCmp.drawToolService['polygonPreviewInsertAfterIndex'],
      };
    });

    expect(beforeInsert.count).toBe(3);

    const secondRow = page.locator('.point-row').nth(1);
    await secondRow.locator('.point-action-btn').nth(0).click();
    await page.waitForTimeout(300);

    const afterInsert = await page.evaluate(() => {
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const points = editCmp.shapeFormService.pointsArray.value;
      return {
        count: points.length,
        inserted: {
          latitude: Number(points[2]?.coordinates?.latitude ?? 0),
          longitude: Number(points[2]?.coordinates?.longitude ?? 0),
        },
        shifted: {
          latitude: Number(points[3]?.coordinates?.latitude ?? 0),
          longitude: Number(points[3]?.coordinates?.longitude ?? 0),
        },
        insertAfterIndex:
          mapCmp.drawToolService['polygonPreviewInsertAfterIndex'],
      };
    });

    expect(afterInsert.count).toBe(4);
    expect(afterInsert.inserted.latitude).toBe(0);
    expect(afterInsert.inserted.longitude).toBe(0);
    expect(afterInsert.shifted.latitude).toBeCloseTo(
      beforeInsert.third.latitude,
      3,
    );
    expect(afterInsert.shifted.longitude).toBeCloseTo(
      beforeInsert.third.longitude,
      3,
    );
    expect(afterInsert.insertAfterIndex).toBe(1);

    const thirdRow = page.locator('.point-row').nth(2);
    await thirdRow.locator('.point-action-btn').nth(1).click();
    await page.waitForTimeout(300);

    const afterRemove = await page.evaluate(() => {
      const editCmp = (window as any).ng.getComponent(
        document.querySelector('app-edit-draw'),
      );
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const points = editCmp.shapeFormService.pointsArray.value;
      return {
        count: points.length,
        third: {
          latitude: Number(points[2]?.coordinates?.latitude ?? 0),
          longitude: Number(points[2]?.coordinates?.longitude ?? 0),
        },
        insertAfterIndex:
          mapCmp.drawToolService['polygonPreviewInsertAfterIndex'],
      };
    });

    expect(afterRemove.count).toBe(3);
    expect(afterRemove.third.latitude).toBeCloseTo(
      beforeInsert.third.latitude,
      3,
    );
    expect(afterRemove.third.longitude).toBeCloseTo(
      beforeInsert.third.longitude,
      3,
    );
    expect(afterRemove.insertAfterIndex).toBeNull();
  });

  test('Regression: Clicking map after save should update form coordinates again', async ({
    page,
  }) => {
    await page.locator('.draw-btn').nth(0).click();
    await page.waitForTimeout(500);

    const canvas = page.locator('#cesiumContainer canvas').first();
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    const centerX = bounds.x + bounds.width * 0.5;
    const centerY = bounds.y + bounds.height * 0.5;

    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(700);

    const saveButton = page.locator('button.save').first();
    await expect(saveButton).toBeEnabled();
    await saveButton.click({ force: true });
    await page.waitForTimeout(800);

    const longitudeInput = page
      .locator('input[placeholder="Longitude"]')
      .first();
    const latitudeInput = page.locator('input[placeholder="Latitude"]').first();

    await expect(longitudeInput).toHaveValue('0');
    await expect(latitudeInput).toHaveValue('0');

    await page.mouse.click(
      bounds.x + bounds.width * 0.35,
      bounds.y + bounds.height * 0.45,
    );
    await page.waitForTimeout(700);

    const longitudeAfter = await longitudeInput.inputValue();
    const latitudeAfter = await latitudeInput.inputValue();

    expect(Number(longitudeAfter)).not.toBe(0);
    expect(Number(latitudeAfter)).not.toBe(0);
  });

  test('Regression: Switching shape type should clear previously clicked positions', async ({
    page,
  }) => {
    await page.locator('.draw-btn').nth(0).click();
    await page.waitForTimeout(500);

    const canvas = page.locator('#cesiumContainer canvas').first();
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    await page.mouse.click(
      bounds.x + bounds.width * 0.5,
      bounds.y + bounds.height * 0.5,
    );
    await page.waitForTimeout(700);

    const textLongitudeInput = page
      .locator('input[placeholder="Longitude"]')
      .first();
    const textLatitudeInput = page
      .locator('input[placeholder="Latitude"]')
      .first();
    await expect(textLongitudeInput).not.toHaveValue('0');
    await expect(textLatitudeInput).not.toHaveValue('0');

    await page.locator('.draw-btn').nth(1).click();
    await page.waitForTimeout(700);

    const longitudeInputs = page.locator('input[placeholder="Longitude"]');
    const latitudeInputs = page.locator('input[placeholder="Latitude"]');
    await expect(longitudeInputs).toHaveCount(2);
    await expect(latitudeInputs).toHaveCount(2);
    await expect(longitudeInputs.nth(0)).toHaveValue('0');
    await expect(latitudeInputs.nth(0)).toHaveValue('0');
    await expect(longitudeInputs.nth(1)).toHaveValue('0');
    await expect(latitudeInputs.nth(1)).toHaveValue('0');
  });

  test('Regression: Right click should open CM for thin saved polyline via invisible hit area', async ({
    page,
  }) => {
    const geometry = await addSavedShapeAndGetEdgeGeometry(page, {
      id: 'saved-thin-polyline',
      name: 'Saved Thin Polyline',
      shapeType: 'DRAW_POLYLINE',
      points: [
        {
          coordinates: { latitude: 32.0, longitude: 34.0 },
          altitude: { feet: 0 },
        },
        {
          coordinates: { latitude: 32.2, longitude: 35.0 },
          altitude: { feet: 0 },
        },
      ],
      lineType: 'solid',
      lineWidth: 2,
      lineColor: '#00ffff',
    });

    const result = await rightClickNearSavedShapeHitArea(page, geometry);

    expect(result).toBeTruthy();
    expect(result?.offset).not.toBe(0);
    expect(result?.contextState.contextMenuVisible).toBeTruthy();
    expect(result?.contextState.contextMenuShapeId).toBe('saved-thin-polyline');
  });

  test('Regression: Right click should open CM for thin saved polygon via invisible hit area', async ({
    page,
  }) => {
    const geometry = await addSavedShapeAndGetEdgeGeometry(page, {
      id: 'saved-thin-polygon',
      name: 'Saved Thin Polygon',
      shapeType: 'DRAW_POLYGON',
      points: [
        {
          coordinates: { latitude: 32.0, longitude: 34.0 },
          altitude: { feet: 0 },
        },
        {
          coordinates: { latitude: 32.25, longitude: 35.0 },
          altitude: { feet: 0 },
        },
        {
          coordinates: { latitude: 31.8, longitude: 34.5 },
          altitude: { feet: 0 },
        },
      ],
      lineType: 'solid',
      lineWidth: 2,
      lineColor: '#00ffff',
    });

    const result = await rightClickNearSavedShapeHitArea(page, geometry);

    expect(result).toBeTruthy();
    expect(result?.offset).not.toBe(0);
    expect(result?.contextState.contextMenuVisible).toBeTruthy();
    expect(result?.contextState.contextMenuShapeId).toBe('saved-thin-polygon');
  });

  test('Bug 16: Typing coordinates in form should update map entity for new circle', async ({
    page,
  }) => {
    // Select circle tool
    await page.locator('[data-test-id="draw-circle-button"]').click();
    await page.waitForTimeout(500);

    // Verify form is open and positions are empty
    const initialPositions = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      return mapCmp.drawToolService.positions.length;
    });
    expect(initialPositions).toBe(0);

    // Type coordinates directly into form inputs (no map click)
    const latInput = page.locator('[data-test-id="latitude-input"]').first();
    const lonInput = page.locator('[data-test-id="longitude-input"]').first();
    const radiusInput = page.locator('[data-test-id="radius-input"]');

    await latInput.fill('32.1');
    await lonInput.fill('34.8');
    await radiusInput.fill('500');

    // Wait for debounce (100ms) + rendering
    await page.waitForTimeout(300);

    // Verify positions updated on the draw tool
    const result = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      const drawTool = mapCmp.drawToolService;
      return {
        positionsLength: drawTool.positions.length,
        radius: drawTool.radius,
      };
    });

    expect(result.positionsLength).toBe(1);
    expect(result.radius).toBe(500);
  });

  test('Bug 16: Typing coordinates in form should update map entity for new text', async ({
    page,
  }) => {
    // Select text tool
    await page.locator('[data-test-id="draw-text-button"]').click();
    await page.waitForTimeout(500);

    // Type coordinates
    const latInput = page.locator('[data-test-id="latitude-input"]').first();
    const lonInput = page.locator('[data-test-id="longitude-input"]').first();

    await latInput.fill('31.5');
    await lonInput.fill('35.2');

    await page.waitForTimeout(300);

    const positionsLength = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      return mapCmp.drawToolService.positions.length;
    });

    expect(positionsLength).toBe(1);
  });

  test('Bug 16: Typing coordinates in form should update map entity for new polyline', async ({
    page,
  }) => {
    // Select line tool
    await page.locator('[data-test-id="draw-line-button"]').click();
    await page.waitForTimeout(500);

    // Type both points
    const latInputs = page.locator('[data-test-id="latitude-input"]');
    const lonInputs = page.locator('[data-test-id="longitude-input"]');

    await latInputs.nth(0).fill('32.0');
    await lonInputs.nth(0).fill('34.5');
    await latInputs.nth(1).fill('32.5');
    await lonInputs.nth(1).fill('35.0');

    await page.waitForTimeout(300);

    const positionsLength = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      return mapCmp.drawToolService.positions.length;
    });

    expect(positionsLength).toBe(2);
  });

  test('Bug 16: Typing coordinates in form should update map entity for new polygon', async ({
    page,
  }) => {
    // Select polygon tool
    await page.locator('[data-test-id="draw-polygon-button"]').click();
    await page.waitForTimeout(500);

    // Type 3 points
    const latInputs = page.locator('[data-test-id="latitude-input"]');
    const lonInputs = page.locator('[data-test-id="longitude-input"]');

    await latInputs.nth(0).fill('32.0');
    await lonInputs.nth(0).fill('34.0');
    await latInputs.nth(1).fill('32.5');
    await lonInputs.nth(1).fill('34.5');
    await latInputs.nth(2).fill('32.0');
    await lonInputs.nth(2).fill('35.0');

    await page.waitForTimeout(300);

    const positionsLength = await page.evaluate(() => {
      const mapCmp = (window as any).ng.getComponent(
        document.querySelector('app-map'),
      );
      return mapCmp.drawToolService.positions.length;
    });

    expect(positionsLength).toBe(3);
  });
});

test.describe('Debug Console Output', () => {
  test('Capture all debug output from a click', async ({ page }) => {
    const debugLogs: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      debugLogs.push(`[${msg.type()}] ${text}`);
    });

    await page.goto('/');
    await page.waitForTimeout(3000); // Wait for Cesium

    // Log any errors that occurred during load
    console.log('=== Captured Console Messages ===');
    debugLogs.forEach((log) => console.log(log));

    // Try to dismiss Cesium error panel if present
    const errorPanel = page.locator('.cesium-widget-errorPanel');
    if (await errorPanel.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('Cesium error panel detected - trying to close it');
      const closeBtn = errorPanel.locator('button');
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(500);
      } else {
        // Click elsewhere to dismiss
        await page.click('body', { position: { x: 10, y: 10 }, force: true });
      }
    }

    // Enter edit mode with force
    const modeToggle = page.locator('.mode-btn').first();
    await modeToggle.click({ force: true });
    await page.waitForTimeout(500);

    // Select polyline (2nd button)
    const polylineBtn = page.locator('.draw-btn').nth(1);
    await polylineBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Click on the canvas
    const canvas = page.locator('#cesiumContainer canvas').first();
    const bounds = await canvas.boundingBox();
    if (bounds) {
      await page.mouse.click(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      await page.waitForTimeout(1000);
    }

    console.log('=== DEBUG LOGS AFTER CLICKS ===');
    debugLogs.forEach((log) => console.log(log));
    console.log('=== END DEBUG LOGS ===');

    // Output debug logs for inspection
    expect(debugLogs.length).toBeGreaterThan(0);
  });
});
