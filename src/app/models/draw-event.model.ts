export enum OutlineType {
  solid = 'solid',
  dashed = 'dashed',
  dotted = 'dotted',
}

export type DrawInputStyleOptionValue = string | number | OutlineType;

export interface DrawInputStyleOption {
  optionValue: DrawInputStyleOptionValue;
  optionImageName: string;
  img: string;
}

export interface DrawInput {
  inputName: string;
  options: DrawInputStyleOption[];
}
