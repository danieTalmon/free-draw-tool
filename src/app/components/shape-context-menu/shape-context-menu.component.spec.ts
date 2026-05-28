import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ShapeContextMenuComponent } from '@components/shape-context-menu/shape-context-menu.component';
import { ContextMenuAction } from '@models/context-menu-action.model';
import { SavedShapeEntity } from '@models/saved-shape-entity.model';
import { ShapeDto } from '@models/shape.model';
import { OutlineType } from '@models/draw-event.model';
import { Entity } from 'cesium';

describe('ShapeContextMenuComponent', () => {
  let component: ShapeContextMenuComponent;
  let fixture: ComponentFixture<ShapeContextMenuComponent>;

  const createMockSavedShape = (): SavedShapeEntity => {
    const dto: ShapeDto = {
      id: 'test-shape',
      name: 'Test Shape',
      shapeType: 'DRAW_CIRCLE',
      points: [
        {
          coordinates: { latitude: 32.0, longitude: 34.0 },
          altitude: { feet: 0 },
        },
      ],
      lineType: OutlineType.solid,
      lineWidth: 2,
      lineColor: '#00ffff',
    };

    return {
      entity: new Entity({ id: 'test-entity' }),
      shapeDto: dto,
    };
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShapeContextMenuComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ShapeContextMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initial state', () => {
    it('should have default x position of 0', () => {
      expect(component.x).toBe(0);
    });

    it('should have default y position of 0', () => {
      expect(component.y).toBe(0);
    });

    it('should not be visible by default', () => {
      expect(component.visible).toBeFalse();
    });

    it('should have null shape by default', () => {
      expect(component.shape).toBeNull();
    });
  });

  describe('Menu visibility', () => {
    it('should not render menu when not visible', () => {
      component.visible = false;
      component.shape = createMockSavedShape();
      fixture.detectChanges();

      const menu = fixture.debugElement.query(By.css('.context-menu'));
      expect(menu).toBeNull();
    });

    it('should not render menu when shape is null', () => {
      component.visible = true;
      component.shape = null;
      fixture.detectChanges();

      const menu = fixture.debugElement.query(By.css('.context-menu'));
      expect(menu).toBeNull();
    });

    it('should render menu when visible and shape is set', () => {
      component.visible = true;
      component.shape = createMockSavedShape();
      fixture.detectChanges();

      const menu = fixture.debugElement.query(By.css('.context-menu'));
      expect(menu).toBeTruthy();
    });
  });

  describe('Menu positioning', () => {
    beforeEach(() => {
      component.visible = true;
      component.shape = createMockSavedShape();
    });

    it('should position menu at specified x coordinate', () => {
      component.x = 100;
      fixture.detectChanges();

      const menu = fixture.debugElement.query(By.css('.context-menu'));
      expect(menu.styles['left']).toBe('100px');
    });

    it('should position menu at specified y coordinate', () => {
      component.y = 200;
      fixture.detectChanges();

      const menu = fixture.debugElement.query(By.css('.context-menu'));
      expect(menu.styles['top']).toBe('200px');
    });
  });

  describe('Menu items', () => {
    beforeEach(() => {
      component.visible = true;
      component.shape = createMockSavedShape();
      fixture.detectChanges();
    });

    it('should display edit menu item', () => {
      const menuItems = fixture.debugElement.queryAll(By.css('.menu-item'));
      const editItem = menuItems.find((item) =>
        item.nativeElement.textContent.includes('Open Property Form'),
      );
      expect(editItem).toBeTruthy();
    });

    it('should display delete menu item', () => {
      const menuItems = fixture.debugElement.queryAll(By.css('.menu-item'));
      const deleteItem = menuItems.find((item) =>
        item.nativeElement.textContent.includes('Delete'),
      );
      expect(deleteItem).toBeTruthy();
    });

    it('should have delete class on delete item', () => {
      const deleteItem = fixture.debugElement.query(
        By.css('.menu-item.delete'),
      );
      expect(deleteItem).toBeTruthy();
    });
  });

  describe('onEdit', () => {
    let emittedAction: ContextMenuAction | undefined;
    let closeEmitted: boolean;

    beforeEach(() => {
      emittedAction = undefined;
      closeEmitted = false;

      component.visible = true;
      component.shape = createMockSavedShape();
      fixture.detectChanges();

      component.action.subscribe((action: ContextMenuAction) => {
        emittedAction = action;
      });
      component.close.subscribe(() => {
        closeEmitted = true;
      });
    });

    it('should emit action with type edit', () => {
      const event = new MouseEvent('click');
      component.onEdit(event);
      expect(emittedAction?.type).toBe('edit');
    });

    it('should emit action with shape', () => {
      const event = new MouseEvent('click');
      component.onEdit(event);
      expect(emittedAction?.shape).toBe(component.shape!);
    });

    it('should emit close event', () => {
      const event = new MouseEvent('click');
      component.onEdit(event);
      expect(closeEmitted).toBeTrue();
    });

    it('should stop event propagation', () => {
      const event = new MouseEvent('click');
      spyOn(event, 'stopPropagation');
      component.onEdit(event);
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('should not emit action when shape is null', () => {
      component.shape = null;
      const event = new MouseEvent('click');
      component.onEdit(event);
      expect(emittedAction).toBeUndefined();
    });
  });

  describe('onDelete', () => {
    let emittedAction: ContextMenuAction | undefined;
    let closeEmitted: boolean;

    beforeEach(() => {
      emittedAction = undefined;
      closeEmitted = false;

      component.visible = true;
      component.shape = createMockSavedShape();
      fixture.detectChanges();

      component.action.subscribe((action: ContextMenuAction) => {
        emittedAction = action;
      });
      component.close.subscribe(() => {
        closeEmitted = true;
      });
    });

    it('should emit action with type delete', () => {
      const event = new MouseEvent('click');
      component.onDelete(event);
      expect(emittedAction?.type).toBe('delete');
    });

    it('should emit action with shape', () => {
      const event = new MouseEvent('click');
      component.onDelete(event);
      expect(emittedAction?.shape).toBe(component.shape!);
    });

    it('should emit close event', () => {
      const event = new MouseEvent('click');
      component.onDelete(event);
      expect(closeEmitted).toBeTrue();
    });

    it('should stop event propagation', () => {
      const event = new MouseEvent('click');
      spyOn(event, 'stopPropagation');
      component.onDelete(event);
      expect(event.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('onMenuClick', () => {
    it('should stop event propagation', () => {
      const event = new MouseEvent('click');
      spyOn(event, 'stopPropagation');
      component.onMenuClick(event);
      expect(event.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('Document click handler', () => {
    it('should emit close when visible and document is clicked', () => {
      component.visible = true;
      component.shape = createMockSavedShape();

      let closeEmitted = false;
      component.close.subscribe(() => {
        closeEmitted = true;
      });

      const event = new MouseEvent('click');
      component.onDocumentClick(event);

      expect(closeEmitted).toBeTrue();
    });

    it('should not emit close when not visible', () => {
      component.visible = false;

      let closeEmitted = false;
      component.close.subscribe(() => {
        closeEmitted = true;
      });

      const event = new MouseEvent('click');
      component.onDocumentClick(event);

      expect(closeEmitted).toBeFalse();
    });
  });

  describe('Escape key handler', () => {
    it('should emit close when visible and escape is pressed', () => {
      component.visible = true;
      component.shape = createMockSavedShape();

      let closeEmitted = false;
      component.close.subscribe(() => {
        closeEmitted = true;
      });

      component.onEscape();

      expect(closeEmitted).toBeTrue();
    });

    it('should not emit close when not visible', () => {
      component.visible = false;

      let closeEmitted = false;
      component.close.subscribe(() => {
        closeEmitted = true;
      });

      component.onEscape();

      expect(closeEmitted).toBeFalse();
    });
  });

  describe('Click interactions', () => {
    beforeEach(() => {
      component.visible = true;
      component.shape = createMockSavedShape();
      fixture.detectChanges();
    });

    it('should trigger edit on edit item click', () => {
      let emittedAction: ContextMenuAction | undefined;
      component.action.subscribe((action: ContextMenuAction) => {
        emittedAction = action;
      });

      const menuItems = fixture.debugElement.queryAll(By.css('.menu-item'));
      const editItem = menuItems[0]; // First item is edit
      editItem.triggerEventHandler('click', new MouseEvent('click'));

      expect(emittedAction?.type).toBe('edit');
    });

    it('should trigger delete on delete item click', () => {
      let emittedAction: ContextMenuAction | undefined;
      component.action.subscribe((action: ContextMenuAction) => {
        emittedAction = action;
      });

      const deleteItem = fixture.debugElement.query(
        By.css('.menu-item.delete'),
      );
      deleteItem.triggerEventHandler('click', new MouseEvent('click'));

      expect(emittedAction?.type).toBe('delete');
    });
  });
});
