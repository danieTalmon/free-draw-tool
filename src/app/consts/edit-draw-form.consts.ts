import { MapOperationsEnum } from '@models/map-operations-enum';
import { DrawMapOption } from '@models/user-preferences';

export const SHAPE_TYPE_TO_FORM_TYPE_TITLE: Record<DrawMapOption, string> = {
  [MapOperationsEnum.DRAW_CIRCLE]: 'Circle',
  [MapOperationsEnum.DRAW_TEXT]: 'Text',
  [MapOperationsEnum.DRAW_POLYLINE]: 'Line',
  [MapOperationsEnum.DRAW_POLYGON]: 'Polygon',
  [MapOperationsEnum.DRAW_NONE]: '',
};
