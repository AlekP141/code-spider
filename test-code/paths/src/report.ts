export function loadRows(): string[] {
  return ["a", "b"];
}

export function readRows(): string[] {
  return loadRows();
}

export function renderCell(row: string): string {
  return `<td>${row}</td>`;
}

export function renderTable(rows: string[]): string {
  return rows.map((row) => renderCell(row)).join("");
}

export function buildReport(): string {
  return renderTable(readRows());
}
