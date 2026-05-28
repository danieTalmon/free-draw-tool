import { Injectable, Signal, signal } from '@angular/core';
import { Observable, Subscriber } from 'rxjs';
import { MapOperationsEnum } from '@models/map-operations-enum';
import { DrawMapOption } from '@models/user-preferences';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private readonly editDrawShapeState = signal<DrawMapOption>(
    MapOperationsEnum.DRAW_NONE,
  );
  private readonly editDrawShapeSubscribers = new Set<
    Subscriber<DrawMapOption>
  >();

  readonly editDrawShapeSignal: Signal<DrawMapOption> =
    this.editDrawShapeState.asReadonly();

  readonly editDrawShape$: Observable<DrawMapOption> = new Observable(
    (subscriber) => {
      subscriber.next(this.editDrawShapeState());
      this.editDrawShapeSubscribers.add(subscriber);

      return () => {
        this.editDrawShapeSubscribers.delete(subscriber);
      };
    },
  );

  readonly setEditDrawShape = (drawType: DrawMapOption): void => {
    this.editDrawShapeState.set(drawType);
    this.editDrawShapeSubscribers.forEach((subscriber) => {
      subscriber.next(drawType);
    });
  };

  readonly getEditDrawShape = (): DrawMapOption => {
    return this.editDrawShapeState();
  };
}
