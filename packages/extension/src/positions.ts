/**
 * Zero-based line and character to a zero-based character offset into `text`,
 * the same arithmetic the CLI applies to its one-based line:col. A CRLF
 * file's `\r` stays inside its line, so it is counted.
 */
export function positionToOffset(
  text: string,
  line: number,
  character: number,
): number {
  const lines = text.split("\n");
  if (line < 0 || line >= lines.length) {
    throw new RangeError(
      `Line ${line + 1} is out of range (file has ${lines.length} lines)`,
    );
  }

  let offset = 0;
  for (let i = 0; i < line; i += 1) {
    offset += (lines[i] ?? "").length + 1;
  }
  const lineLength = (lines[line] ?? "").length;
  return offset + Math.min(character, lineLength);
}
