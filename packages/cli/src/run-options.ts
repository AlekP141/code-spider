export const ROOT_FLAG = "--root";
const TIMING_FLAG = "--timing";
const REPEAT_FLAG = "--repeat";
const MAX_REPEAT = 100;

export type RunOptions = { timing: boolean; repeat: number; rest: string[] };

const REPEAT_PATTERN = /^[1-9]\d*$/;

function parseRepeat(value: string | undefined): number {
  if (value === undefined || !REPEAT_PATTERN.test(value)) {
    throw new Error(`${REPEAT_FLAG} requires a positive integer`);
  }
  const count = Number(value);
  if (count > MAX_REPEAT) {
    throw new Error(`${REPEAT_FLAG} must be at most ${MAX_REPEAT}`);
  }
  return count;
}

export function parseRunOptions(argv: string[]): RunOptions {
  let timing = false;
  let repeat = 1;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === ROOT_FLAG) {
      rest.push(arg, ...argv.slice(i + 1, i + 2));
      i += 1;
    } else if (arg === TIMING_FLAG) {
      timing = true;
    } else if (arg === REPEAT_FLAG) {
      const value = argv[i + 1];
      i += 1;
      repeat = parseRepeat(value?.startsWith("--") ? undefined : value);
    } else if (arg.startsWith(`${REPEAT_FLAG}=`)) {
      repeat = parseRepeat(arg.slice(REPEAT_FLAG.length + 1));
    } else {
      rest.push(arg);
    }
  }

  return { timing, repeat, rest };
}
