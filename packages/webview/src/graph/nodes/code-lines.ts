export type CodeLine = { indent: string; text: string };

const LEADING_BLANKS = /^[ \t]*/;

export function splitCodeLines(codePreview: string): CodeLine[] {
  return codePreview.split("\n").map((raw) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const indent = LEADING_BLANKS.exec(line)?.[0] ?? "";
    return { indent, text: line.slice(indent.length) };
  });
}
