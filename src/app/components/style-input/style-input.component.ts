import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import {
  DrawInput,
  DrawInputStyleOption,
  DrawInputStyleOptionValue,
} from '@models/draw-event.model';

@Component({
  selector: 'app-style-input',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSelectModule, MatOptionModule],
  templateUrl: './style-input.component.html',
  styleUrls: ['./style-input.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => StyleInputComponent),
      multi: true,
    },
  ],
})
export class StyleInputComponent implements OnInit, ControlValueAccessor {
  selected: DrawInputStyleOption = {
    img: '',
    optionImageName: '',
    optionValue: '',
  };
  @Input() config: DrawInput = { inputName: '', options: [] };
  @Input() replaceLineWithText = false;
  panelClass = 'style-input-panel';
  selectedValue: DrawInputStyleOptionValue | null = null;
  disabled = false;
  private incomingValue: DrawInputStyleOptionValue | null = null;

  private onChange: (value: DrawInputStyleOptionValue) => void = () =>
    undefined;
  private onTouched: () => void = () => undefined;

  ngOnInit(): void {
    this.syncConfigState();
    this.syncSelectedFromValue(this.incomingValue);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] || changes['replaceLineWithText']) {
      this.syncConfigState();
      this.syncSelectedFromValue(this.selectedValue ?? this.incomingValue);
    }
  }

  writeValue(value: DrawInputStyleOptionValue | null): void {
    this.incomingValue = value;
    this.syncSelectedFromValue(value);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onOptionSelected(value: DrawInputStyleOptionValue): void {
    this.syncSelectedFromValue(value);
    this.onChange(this.selected.optionValue);
    this.onTouched();
  }

  private syncConfigState(): void {
    this.panelClass =
      this.config.inputName === 'Line Color'
        ? 'style-input-panel style-input-panel--colors'
        : 'style-input-panel';

    if (this.replaceLineWithText && this.config.inputName === 'Line Color') {
      this.config = { ...this.config, inputName: 'Text Color' };
    }
  }

  private syncSelectedFromValue(value: DrawInputStyleOptionValue | null): void {
    if (this.config.options.length === 0) {
      return;
    }

    const matchedOption = this.config.options.find((option) =>
      this.optionMatchesValue(option, value),
    );

    this.selected = matchedOption ?? this.config.options[0];
    this.selectedValue = this.selected.optionValue;
  }

  private optionMatchesValue(
    option: DrawInputStyleOption,
    value: DrawInputStyleOptionValue | null,
  ): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    return String(option.optionValue) === String(value);
  }
}
