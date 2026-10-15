export function leaf(): number {
  return 3;
}

export function helper(): number {
  return leaf() + 1;
}
