function ms(value: number): string {
  return `${Math.round(value)}ms`;
}

export function formatTiming(
  loadMs: number,
  analyzeMs: readonly number[],
): string[] {
  const load = `load: ${ms(loadMs)}`;
  if (analyzeMs.length === 1) {
    return [`${load}  analyze: ${ms(analyzeMs[0] ?? 0)}`];
  }
  return [
    load,
    ...analyzeMs.map((value, i) => `analyze[${i + 1}]: ${ms(value)}`),
  ];
}
