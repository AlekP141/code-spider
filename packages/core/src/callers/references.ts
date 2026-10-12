import { ts, type Node, type SourceFile } from "ts-morph";

type ReferenceEntry = {
  fileName: string;
  textSpan: ts.TextSpan;
  isDefinition?: boolean;
};

type ReferencedSymbol = {
  definition: { kind: string };
  references: ReferenceEntry[];
};

type FindAllReferences = {
  findReferencedSymbols(
    program: ts.Program,
    cancellationToken: ts.CancellationToken,
    sourceFiles: readonly ts.SourceFile[],
    sourceFile: ts.SourceFile,
    position: number,
  ): ReferencedSymbol[] | undefined;
};

/**
 * TypeScript's internal reference finder, the one behind the language
 * service's findReferences. Calling it on ts-morph's own program avoids the
 * language service building a second program with a second checker.
 */
const finder = (ts as unknown as { FindAllReferences?: FindAllReferences })
  .FindAllReferences;

const NEVER_CANCELLED: ts.CancellationToken = {
  isCancellationRequested: () => false,
  throwIfCancellationRequested: () => {},
};

/**
 * Same result as ts-morph's `findReferencesAsNodes`, without its language
 * service.
 */
export function findReferenceNodes(nameNode: Node): Node[] {
  if (!finder) {
    throw new Error("This TypeScript version has no FindAllReferences API");
  }
  const project = nameNode.getProject();
  const program = project.getProgram().compilerObject;
  const symbols =
    finder.findReferencedSymbols(
      program,
      NEVER_CANCELLED,
      program.getSourceFiles(),
      nameNode.getSourceFile().compilerNode,
      nameNode.getStart(),
    ) ?? [];

  return symbols.flatMap(({ definition, references }) => {
    const isAlias = definition.kind === ts.ScriptElementKind.alias;
    // ts-morph skips a symbol's own declaration unless it is an alias.
    const kept = references.filter(
      (entry, i) => isAlias || !entry.isDefinition || i > 0,
    );
    return kept.flatMap((entry) => {
      const file = project.getSourceFile(entry.fileName);
      return file ? (nodeAt(file, entry.textSpan) ?? []) : [];
    });
  });
}

function nodeAt(file: SourceFile, span: ts.TextSpan): Node | undefined {
  let node = file.getDescendantAtPos(span.start);
  while (node && node.getWidth() < span.length) node = node.getParent();
  return node;
}
