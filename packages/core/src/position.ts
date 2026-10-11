const LINE_BREAK = /\r\n|\r|\n/g;
const BYTE_ORDER_MARK = "\uFEFF";

/**
 * Zero-based line and character to a zero-based offset into `text`. A line
 * break is `\r\n`, `\n` or a lone `\r`, each once. A character past the end of
 * the line, or below zero, is clamped to it. A leading byte-order mark is not
 * a character of line 0.
 */
export function positionToOffset(
  text: string,
  line: number,
  character: number,
): number {
  const starts = [text.startsWith(BYTE_ORDER_MARK) ? 1 : 0];
  const ends: number[] = [];
  for (const match of text.matchAll(LINE_BREAK)) {
    ends.push(match.index);
    starts.push(match.index + match[0].length);
  }
  ends.push(text.length);

  const start = starts[line];
  const end = ends[line];
  if (start === undefined || end === undefined) {
    throw new RangeError(
      `Line ${line + 1} is out of range (file has ${starts.length} lines)`,
    );
  }
  return Math.min(start + Math.max(character, 0), end);
}
