import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { ShapeApiService } from '@services/shape-api.service';
import { ShapeDto } from '@models/shape.model';
import { OutlineType } from '@models/draw-event.model';

describe('ShapeApiService', () => {
  let service: ShapeApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ShapeApiService],
    });
    service = TestBed.inject(ShapeApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  const createTestShape = (
    overrides: Partial<ShapeDto> = {},
  ): Omit<ShapeDto, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: 'Test Shape',
    shapeType: 'DRAW_CIRCLE',
    points: [
      {
        coordinates: { latitude: 32.0, longitude: 34.0 },
        altitude: { feet: 0 },
      },
    ],
    radius: 500,
    lineType: OutlineType.solid,
    lineWidth: 2,
    lineColor: '#00ffff',
    ...overrides,
  });

  describe('getAll', () => {
    it('should return empty array initially', fakeAsync(() => {
      let result: ShapeDto[] = [];
      service.getAll().subscribe((shapes) => {
        result = shapes;
      });
      tick(200);
      expect(result).toEqual([]);
    }));

    it('should return all created shapes', fakeAsync(() => {
      // Create some shapes first
      service.create(createTestShape({ name: 'Shape 1' })).subscribe();
      tick(300);
      service.create(createTestShape({ name: 'Shape 2' })).subscribe();
      tick(300);

      let result: ShapeDto[] = [];
      service.getAll().subscribe((shapes) => {
        result = shapes;
      });
      tick(200);

      expect(result.length).toBe(2);
    }));
  });

  describe('getById', () => {
    it('should return null for non-existent shape', fakeAsync(() => {
      let result: ShapeDto | null = null;
      service.getById('non-existent').subscribe((shape) => {
        result = shape;
      });
      tick(200);
      expect(result).toBeNull();
    }));

    it('should return shape by id', fakeAsync(() => {
      let createdId: string | undefined;
      service
        .create(createTestShape({ name: 'Find Me' }))
        .subscribe((shape) => {
          createdId = shape.id;
        });
      tick(300);

      let result: ShapeDto | null = null;
      service.getById(createdId!).subscribe((shape) => {
        result = shape;
      });
      tick(200);

      expect(result).toBeTruthy();
      expect((result as any)?.name).toBe('Find Me');
    }));
  });

  describe('create', () => {
    it('should create shape with generated id', fakeAsync(() => {
      let result: ShapeDto | undefined;
      service.create(createTestShape()).subscribe((shape) => {
        result = shape;
      });
      tick(300);

      expect(result).toBeTruthy();
      expect(result?.id).toBeTruthy();
      expect(result?.id).toMatch(/^shape_\d+$/);
    }));

    it('should set timestamps on creation', fakeAsync(() => {
      let result: ShapeDto | undefined;
      service.create(createTestShape()).subscribe((shape) => {
        result = shape;
      });
      tick(300);

      expect(result?.createdAt).toBeTruthy();
      expect(result?.updatedAt).toBeTruthy();
    }));

    it('should set default source to AGS', fakeAsync(() => {
      let result: ShapeDto | undefined;
      service.create(createTestShape()).subscribe((shape) => {
        result = shape;
      });
      tick(300);

      expect(result?.source).toBe('AGS');
    }));

    it('should preserve provided source', fakeAsync(() => {
      let result: ShapeDto | undefined;
      service
        .create({ ...createTestShape(), source: 'CUSTOM' })
        .subscribe((shape) => {
          result = shape;
        });
      tick(300);

      expect(result?.source).toBe('CUSTOM');
    }));

    it('should increment id counter for multiple shapes', fakeAsync(() => {
      const ids: string[] = [];

      service.create(createTestShape()).subscribe((shape) => {
        ids.push(shape.id!);
      });
      tick(300);

      service.create(createTestShape()).subscribe((shape) => {
        ids.push(shape.id!);
      });
      tick(300);

      expect(ids.length).toBe(2);
      expect(ids[0]).not.toBe(ids[1]);
    }));
  });

  describe('update', () => {
    it('should update existing shape', fakeAsync(() => {
      let createdShape: ShapeDto | undefined;
      service
        .create(createTestShape({ name: 'Original' }))
        .subscribe((shape) => {
          createdShape = shape;
        });
      tick(300);

      let updatedShape: ShapeDto | undefined;
      service
        .update(createdShape!.id!, { name: 'Updated' })
        .subscribe((shape) => {
          updatedShape = shape;
        });
      tick(300);

      expect(updatedShape?.name).toBe('Updated');
      expect(updatedShape?.id).toBe(createdShape?.id);
    }));

    it('should update updatedAt timestamp', fakeAsync(() => {
      let createdShape: ShapeDto | undefined;
      service.create(createTestShape()).subscribe((shape) => {
        createdShape = shape;
      });
      tick(300);

      const originalUpdatedAt = createdShape?.updatedAt;

      // Wait a bit to ensure different timestamp
      tick(100);

      let updatedShape: ShapeDto | undefined;
      service
        .update(createdShape!.id!, { name: 'Updated' })
        .subscribe((shape) => {
          updatedShape = shape;
        });
      tick(300);

      expect(updatedShape?.updatedAt).not.toBe(originalUpdatedAt);
    }));

    it('should throw error for non-existent shape', fakeAsync(() => {
      expect(() => {
        service.update('non-existent', { name: 'Test' }).subscribe();
        tick(300);
      }).toThrow();
    }));
  });

  describe('save', () => {
    it('should create new shape when no id', fakeAsync(() => {
      const shapeWithoutId: ShapeDto = {
        ...createTestShape(),
        name: 'New Shape',
      } as ShapeDto;

      let result: ShapeDto | undefined;
      service.save(shapeWithoutId).subscribe((shape) => {
        result = shape;
      });
      tick(300);

      expect(result?.id).toBeTruthy();
      expect(result?.name).toBe('New Shape');
    }));

    it('should update existing shape when id exists', fakeAsync(() => {
      let createdShape: ShapeDto | undefined;
      service
        .create(createTestShape({ name: 'Original' }))
        .subscribe((shape) => {
          createdShape = shape;
        });
      tick(300);

      const shapeToUpdate: ShapeDto = {
        ...createdShape!,
        name: 'Updated via Save',
      };

      let result: ShapeDto | undefined;
      service.save(shapeToUpdate).subscribe((shape) => {
        result = shape;
      });
      tick(300);

      expect(result?.id).toBe(createdShape?.id);
      expect(result?.name).toBe('Updated via Save');
    }));
  });

  describe('delete', () => {
    it('should delete shape by id', fakeAsync(() => {
      let createdShape: ShapeDto | undefined;
      service.create(createTestShape()).subscribe((shape) => {
        createdShape = shape;
      });
      tick(300);

      service.delete(createdShape!.id!).subscribe();
      tick(300);

      let result: ShapeDto | null = null;
      service.getById(createdShape!.id!).subscribe((shape) => {
        result = shape;
      });
      tick(200);

      expect(result).toBeNull();
    }));

    it('should not throw when deleting non-existent shape', fakeAsync(() => {
      expect(() => {
        service.delete('non-existent').subscribe();
        tick(300);
      }).not.toThrow();
    }));
  });

  describe('Integration scenarios', () => {
    it('should handle CRUD lifecycle', fakeAsync(() => {
      // Create
      let shape: ShapeDto | undefined;
      service
        .create(createTestShape({ name: 'Lifecycle Test' }))
        .subscribe((s) => {
          shape = s;
        });
      tick(300);
      expect(shape?.name).toBe('Lifecycle Test');

      // Read
      let fetchedShape: ShapeDto | null = null;
      service.getById(shape!.id!).subscribe((s) => {
        fetchedShape = s;
      });
      tick(200);
      expect((fetchedShape as any)?.name).toBe('Lifecycle Test');

      // Update
      service
        .update(shape!.id!, { name: 'Updated Lifecycle' })
        .subscribe((s) => {
          shape = s;
        });
      tick(300);
      expect(shape?.name).toBe('Updated Lifecycle');

      // Delete
      service.delete(shape!.id!).subscribe();
      tick(300);

      service.getById(shape!.id!).subscribe((s) => {
        fetchedShape = s;
      });
      tick(200);
      expect(fetchedShape).toBeNull();
    }));
  });
});
