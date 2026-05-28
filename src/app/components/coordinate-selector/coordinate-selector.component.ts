import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  ControlContainer,
  FormGroupName,
  ReactiveFormsModule,
} from '@angular/forms';

@Component({
  selector: 'app-coordinate-selector',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './coordinate-selector.component.html',
  styleUrls: ['./coordinate-selector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupName,
    },
  ],
})
export class CoordinateSelectorComponent {
  @Input() format: 'geo' | 'utm' | 'mgrs' = 'geo';
}
