import { OutlineType } from '@models/draw-event.model';

export interface ShapeDrawStyle {
  lineType: OutlineType;
  lineWidth: number;
  entityColor: string;
  maxPolygonPoints: number;
  textLabel: string;
}
