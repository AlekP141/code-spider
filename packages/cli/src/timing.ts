export type Timings = {
  loadMs: number;
  warmMs: number;
  analyzeMs: readonly number[];
};

function ms(value: number): string {
  return `${Math.round(value)}ms`;
}

export function formatTiming({
  loadMs,
  warmMs,
  analyzeMs,
}: Timings): string[] {
  const setup = `load: ${ms(loadMs)}  warm: ${ms(warmMs)}`;
  if (analyzeMs.length === 1) {
    return [`${setup}  analyze: ${ms(analyzeMs[0] ?? 0)}`];
  }
  return [
    setup,
    ...analyzeMs.map((value, i) => `analyze[${i + 1}]: ${ms(value)}`),
  ];
}
