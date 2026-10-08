import { persist } from "tiny-lib";

export function local(value: string): string {
  return value.trim();
}

export async function usesExternals(value: string): Promise<void> {
  const trimmed = local(value);
  console.log(trimmed);
  await persist(trimmed);
}
