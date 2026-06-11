import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';

import { StyleInputComponent } from '@components/style-input/style-input.component';
import { DrawInput } from '@models/draw-event.model';

@Component({
  template: `
    <form [formGroup]="form">
      <app-style-input
        formControlName="lineWidth"
        [config]="lineWidthInput"
      ></app-style-input>
    </form>
  `,
})
class HostComponent {
  form = new FormGroup({
    lineWidth: new FormControl<number | string>(2),
  });

  lineWidthInput: DrawInput = {
    inputName: 'Line Width',
    options: [
      {
        optionValue: 2,
        optionImageName: 'line-width-2px.svg',
        img: '<img height="30" src="assets/draw/line-width-2px.svg">',
      },
      {
        optionValue: 4,
        optionImageName: 'line-width-4px.svg',
        img: '<img height="30" src="assets/draw/line-width-4px.svg">',
      },
      {
        optionValue: 6,
        optionImageName: 'line-width-6px.svg',
        img: '<img height="30" src="assets/draw/line-width-6px.svg">',
      },
    ],
  };
}

describe('StyleInputComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [
        StyleInputComponent,
        ReactiveFormsModule,
        BrowserAnimationsModule,
        MatSelectModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const getStyleInput = (): StyleInputComponent => {
    const styleInputDebug = fixture.debugElement.query(
      By.directive(StyleInputComponent),
    );
    return styleInputDebug.componentInstance as StyleInputComponent;
  };

  it('should resolve the initial form value', () => {
    const styleInput = getStyleInput();
    expect(styleInput.selected.optionValue).toBe(2);
  });

  it('should match option values when form value comes as string', () => {
    host.form.get('lineWidth')?.setValue('4');
    fixture.detectChanges();

    const styleInput = getStyleInput();
    expect(styleInput.selected.optionValue).toBe(4);
  });

  it('should propagate user selection back to the form control', () => {
    const styleInput = getStyleInput();
    styleInput.onOptionSelected(6);
    fixture.detectChanges();

    expect(host.form.get('lineWidth')?.value).toBe(6);
  });

  it('should not flag a non-color input as a color input', () => {
    const styleInput = getStyleInput();
    expect(styleInput.isColorInput).toBeFalse();
  });
});

@Component({
  template: `
    <form [formGroup]="form">
      <app-style-input
        formControlName="lineColor"
        [config]="lineColorInput"
      ></app-style-input>
    </form>
  `,
})
class ColorHostComponent {
  form = new FormGroup({
    lineColor: new FormControl<string>('#00ffff'),
  });

  lineColorInput: DrawInput = {
    inputName: 'Line Color',
    options: [
      {
        optionValue: '#00ffff',
        optionImageName: 'color-cyan.svg',
        img: '<img height="30" src="assets/draw/color-cyan.svg">',
      },
      {
        optionValue: '#ff0000',
        optionImageName: 'color-red.svg',
        img: '<img height="30" src="assets/draw/color-red.svg">',
      },
    ],
  };
}

describe('StyleInputComponent (color input)', () => {
  let fixture: ComponentFixture<ColorHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ColorHostComponent],
      imports: [
        StyleInputComponent,
        ReactiveFormsModule,
        BrowserAnimationsModule,
        MatSelectModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ColorHostComponent);
    fixture.detectChanges();
  });

  const getStyleInput = (): StyleInputComponent => {
    const styleInputDebug = fixture.debugElement.query(
      By.directive(StyleInputComponent),
    );
    return styleInputDebug.componentInstance as StyleInputComponent;
  };

  it('should flag the color input so the selection indicator is hidden', () => {
    const styleInput = getStyleInput();
    expect(styleInput.isColorInput).toBeTrue();
  });
});
