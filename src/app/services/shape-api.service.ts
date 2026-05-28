import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, delay } from 'rxjs';
import { map } from 'rxjs/operators';
import { ShapeDto } from '@models/shape.model';
import { API_BASE_URL } from '@consts/api.consts';

/**
 * Service for shape CRUD operations with the server
 *
 * NOTE: Currently uses mock implementation.
 * Replace mock methods with real HTTP calls when backend is available.
 */
@Injectable({
  providedIn: 'root',
})
export class ShapeApiService {
  private readonly http = inject(HttpClient);

  // Mock storage for development
  private mockShapes: Map<string, ShapeDto> = new Map();
  private mockIdCounter = 1;

  /**
   * Get all shapes from server
   */
  getAll(): Observable<ShapeDto[]> {
    // TODO: Replace with real API call
    // return this.http.get<ShapeDto[]>(API_BASE_URL);
    return of(Array.from(this.mockShapes.values())).pipe(delay(100));
  }

  /**
   * Get shape by ID
   */
  getById(id: string): Observable<ShapeDto | null> {
    // TODO: Replace with real API call
    // return this.http.get<ShapeDto>(`${API_BASE_URL}/${id}`);
    return of(this.mockShapes.get(id) ?? null).pipe(delay(100));
  }

  /**
   * Create new shape
   */
  create(
    shape: Omit<ShapeDto, 'id' | 'createdAt' | 'updatedAt'>,
  ): Observable<ShapeDto> {
    // TODO: Replace with real API call
    // return this.http.post<ShapeDto>(API_BASE_URL, shape);

    const now = new Date().toISOString();
    const newShape: ShapeDto = {
      ...shape,
      id: `shape_${this.mockIdCounter++}`,
      source: shape.source ?? 'AGS',
      createdAt: now,
      updatedAt: now,
    };
    this.mockShapes.set(newShape.id!, newShape);
    return of(newShape).pipe(delay(200));
  }

  /**
   * Update existing shape
   */
  update(id: string, shape: Partial<ShapeDto>): Observable<ShapeDto> {
    // TODO: Replace with real API call
    // return this.http.put<ShapeDto>(`${API_BASE_URL}/${id}`, shape);

    const existing = this.mockShapes.get(id);
    if (!existing) {
      throw new Error(`Shape with id ${id} not found`);
    }

    const updatedShape: ShapeDto = {
      ...existing,
      ...shape,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.mockShapes.set(id, updatedShape);
    return of(updatedShape).pipe(delay(200));
  }

  /**
   * Save shape (create if no ID, update if ID exists)
   */
  save(shape: ShapeDto): Observable<ShapeDto> {
    if (shape.id) {
      return this.update(shape.id, shape);
    } else {
      return this.create(shape);
    }
  }

  /**
   * Delete shape by ID
   */
  delete(id: string): Observable<void> {
    // TODO: Replace with real API call
    // return this.http.delete<void>(`${API_BASE_URL}/${id}`);

    this.mockShapes.delete(id);
    return of(void 0).pipe(delay(200));
  }
}
