export const TEST_VISIBILITIES = ["show", "hide"] as const;
export type TestVisibility = (typeof TEST_VISIBILITIES)[number];
export const DEFAULT_TEST_VISIBILITY: TestVisibility = "show";

export function isTestVisibility(raw: unknown): raw is TestVisibility {
  return TEST_VISIBILITIES.some((visibility) => visibility === raw);
}

export function normaliseTestVisibility(raw: unknown): TestVisibility {
  return isTestVisibility(raw) ? raw : DEFAULT_TEST_VISIBILITY;
}
