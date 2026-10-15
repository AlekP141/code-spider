export function checkInput(text: string): boolean {
  return text.length > 0;
}

export function parseInput(text: string): string[] {
  return checkInput(text) ? text.split(",") : [];
}

export function handleRequest(text: string): number {
  return parseInput(text).length;
}
