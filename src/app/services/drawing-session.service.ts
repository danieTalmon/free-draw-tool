import { Injectable, computed, inject, signal } from '@angular/core';
import { DrawMapOption } from '@models/user-preferences';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { SavedShapeEntity } from '@models/saved-shape-entity.model';
import { DrawToolService } from '@services/draw-tool.service';
import { SavedShapesService } from '@services/saved-shapes.service';
import { EditShapeFacadeService } from '@services/edit-shape-facade.service';
import { MapService } from '@services/map.service';
import { shapeTypeToMapOperation } from '@adapters/shape.adapter';

export type DrawingSessionMode = 'idle' | 'creating' | 'editing';

interface DrawingSessionState {
  mode: DrawingSessionMode;
  shapeType: DrawMapOption;
  editingShapeId: string | null;
}

const IDLE_STATE: DrawingSessionState = {
  mode: 'idle',
  shapeType: MapOperationsEnum.DRAW_NONE,
  editingShapeId: null,
};

@Injectable({
  providedIn: 'root',
})
export class DrawingSessionService {
  private readonly drawToolService = inject(DrawToolService);
  private readonly savedShapesService = inject(SavedShapesService);
  private readonly editShapeFacadeService = inject(EditShapeFacadeService);
  private readonly mapService = inject(MapService);

  // ── state ─────────────────────────────────────────────────────────────────
  private readonly _state = signal<DrawingSessionState>(IDLE_STATE);

  // ── computed selectors ─────────────────────────────────────────────────────
  readonly mode = computed(() => this._state().mode);
  readonly isActive = computed(() => this._state().mode !== 'idle');
  readonly editingShapeId = computed(() => this._state().editingShapeId);
  readonly shapeType = computed(() => this._state().shapeType);

  // ── public actions ─────────────────────────────────────────────────────────

  /** Start a new shape creation session. */
  readonly startCreating = (type: DrawMapOption): void => {
    this.restorePreviousEditingShape();
    this._state.set({
      mode: 'creating',
      shapeType: type,
      editingShapeId: null,
    });
    this.mapService.setEditDrawShape(type);
    this.drawToolService.startDrawing(type);
  };

  /** Open a saved shape for editing via form. */
  readonly startEditing = (savedShape: SavedShapeEntity): void => {
    const dto = savedShape.shapeDto;
    const shapeId = dto.id!;
    const drawType = shapeTypeToMapOperation(dto.shapeType);

    this.restorePreviousEditingShape();

    // Hide saved entity + its vertex/hit entities so DrawToolService's
    // temp entity and vertex entities are the only ones visible (fixes P-01, P-03).
    this.savedShapesService.hideShape(shapeId);

    this._state.set({
      mode: 'editing',
      shapeType: drawType,
      editingShapeId: shapeId,
    });
    this.mapService.setEditDrawShape(drawType);
    this.drawToolService.startDrawing(drawType, { preserveFormState: true });
    this.editShapeFacadeService.fromShapeDto(dto);
    this.editShapeFacadeService.markAsSaved(dto);
    this.editShapeFacadeService.setCurrentShapeType(drawType);
    this.drawToolService.loadPositionsFromForm();
  };

  /** Switch draw type while a session is active. */
  readonly switchType = (type: DrawMapOption): void => {
    if (this._state().mode === 'idle') return;
    this.restorePreviousEditingShape();
    this._state.set({
      mode: 'creating',
      shapeType: type,
      editingShapeId: null,
    });
    this.mapService.setEditDrawShape(type);
    this.drawToolService.startDrawing(type);
  };

  /** Cancel the active session and restore any hidden saved entity. */
  readonly cancel = (): void => {
    const { mode, editingShapeId } = this._state();
    this.drawToolService.cancelDrawing();
    if (mode === 'editing' && editingShapeId) {
      this.savedShapesService.showShape(editingShapeId);
    }
    this._state.set(IDLE_STATE);
    this.mapService.setEditDrawShape(MapOperationsEnum.DRAW_NONE);
  };

  /**
   * Called by EditDrawComponent after a successful API save.
   * The saved entity was already replaced via savedShapesService.updateShape/addShape,
   * so no show/hide restoration is needed — just clear session state.
   */
  readonly confirmSave = (): void => {
    this._state.set(IDLE_STATE);
    this.mapService.setEditDrawShape(MapOperationsEnum.DRAW_NONE);
  };

  // ── private helpers ────────────────────────────────────────────────────────

  private restorePreviousEditingShape(): void {
    const prevId = this._state().editingShapeId;
    if (prevId) {
      this.savedShapesService.showShape(prevId);
    }
  }
}
