import { SavedShapeEntity } from '@models/saved-shape-entity.model';

export interface ContextMenuAction {
  type: 'edit' | 'delete';
  shape: SavedShapeEntity;
}
