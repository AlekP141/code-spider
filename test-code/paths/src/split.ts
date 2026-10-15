export function source(): number {
  return 1;
}

export function sink(value: number): void {
  console.log(value);
}

export function viaLeft(): number {
  return source() + 1;
}

export function viaRight(): number {
  return source() * 2;
}

export function show(value: number): void {
  sink(value);
}

export function join(): void {
  show(viaLeft() + viaRight());
}
