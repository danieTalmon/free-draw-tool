import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SavedShapeEntity } from '@models/saved-shape-entity.model';
import { ContextMenuAction } from '@models/context-menu-action.model';

@Component({
  selector: 'app-shape-context-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shape-context-menu.component.html',
  styleUrls: ['./shape-context-menu.component.scss'],
})
export class ShapeContextMenuComponent {
  @Input() x = 0;
  @Input() y = 0;
  @Input() visible = false;
  @Input() shape: SavedShapeEntity | null = null;

  @Output() action = new EventEmitter<ContextMenuAction>();
  @Output() close = new EventEmitter<void>();

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Close menu when clicking outside
    if (this.visible) {
      this.close.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible) {
      this.close.emit();
    }
  }

  onEdit(event: MouseEvent): void {
    event.stopPropagation();
    if (this.shape) {
      this.action.emit({ type: 'edit', shape: this.shape });
    }
    this.close.emit();
  }

  onDelete(event: MouseEvent): void {
    event.stopPropagation();
    if (this.shape) {
      this.action.emit({ type: 'delete', shape: this.shape });
    }
    this.close.emit();
  }

  onMenuClick(event: MouseEvent): void {
    // Prevent click from propagating to document
    event.stopPropagation();
  }
}
