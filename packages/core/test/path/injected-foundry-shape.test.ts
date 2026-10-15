import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../../src/analyze.js";
import { findPaths } from "../../src/path/find-paths.js";
import type { StopSignal } from "../../src/path/signal.js";
import { MEMORY_ROOT, memoryProject } from "../helpers.js";

const idle: StopSignal = { isRequested: () => false, reason: () => undefined };

const project = memoryProject({
  "src/generation.ts": [
    "export type Generate = (s: string) => Promise<string>",
    "export const createGeneration = async (): Promise<Generate> => {",
    "  const generateTurn: Generate = async (s) => s",
    "  return async (s) => generateTurn(s)",
    "}",
    "",
  ].join("\n"),
  "src/envelope.ts": [
    'import type { Generate } from "./generation"',
    "export const createEnvelope =",
    "  ({ generate }: { readonly generate: Generate }) =>",
    "  async (s: string) => generate(s)",
    "",
  ].join("\n"),
  "src/tool.ts": [
    "export const createTool = (generateSchema: (s: string) => unknown) => ({",
    "  execute: async (s: string) => generateSchema(s),",
    "})",
    "",
  ].join("\n"),
  "src/tools.ts": [
    'import { createTool } from "./tool"',
    "export const createTools = ({",
    "  generateSchema,",
    "}: {",
    "  readonly generateSchema: (s: string) => unknown",
    "}) => ({ schema: createTool(generateSchema) })",
    "",
  ].join("\n"),
  "src/services.ts": [
    'import { createGeneration } from "./generation"',
    'import { createEnvelope } from "./envelope"',
    "export interface Services { readonly generateSchema: (s: string) => unknown }",
    "export const createServices = async (): Promise<Services> => {",
    "  const generateSchema = createEnvelope({",
    "    generate: await createGeneration(),",
    "  })",
    "  return { generateSchema }",
    "}",
    "",
  ].join("\n"),
  "src/mcp.ts": [
    'import { createTools } from "./tools"',
    'import { createServices } from "./services"',
    "export const createMcp = () =>",
    "  createTools({",
    "    generateSchema: async (s) => (await createServices()).generateSchema(s),",
    "  })",
    "",
  ].join("\n"),
});

describe("paths through awaited factories, consts and handed-on names", () => {
  it("connects the tool to the generator it ends up calling", () => {
    const outcome = findPaths(project, {
      from: "src/tool.ts#createTool",
      to: "src/generation.ts#createGeneration.generateTurn",
      repoRoot: MEMORY_ROOT,
      limits: { timeLimitMs: 5000, maxBoxes: 50 },
      signal: idle,
    });
    expect(outcome.status).toBe("found");
  });

  it("shows what a handed-on parameter ends up as when the tool is focused", () => {
    const file = `${MEMORY_ROOT}/src/tool.ts`;
    const offset = project
      .getSourceFileOrThrow(file)
      .getFullText()
      .indexOf("generateSchema(s)");
    const slice = analyzeFocus(project, {
      file,
      offset,
      repoRoot: MEMORY_ROOT,
    });
    expect(
      slice.edges
        .filter((e) => e.to === slice.focusId)
        .map((e) => [e.from, e.kind]),
    ).toContainEqual(["src/mcp.ts#createMcp", "injected"]);
  });
});
