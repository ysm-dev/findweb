export type RootAction =
  | { kind: "help" }
  | { kind: "login"; rawArgs: string[] }
  | { kind: "search"; rawArgs: string[] };

function isFlag(value: string): boolean {
  return value.startsWith("-");
}

function findFirstPositionalIndex(rawArgs: string[]): number {
  return rawArgs.findIndex((arg) => !isFlag(arg));
}

function removeArgAt(values: string[], index: number): string[] {
  return values.filter((_, currentIndex) => currentIndex !== index);
}

function isLoginLikeCommand(value: string | undefined): boolean {
  return value === "login" || value === "setup";
}

export function resolveRootAction(rawArgs: string[]): RootAction {
  if (rawArgs.length === 0) {
    return { kind: "help" };
  }

  const firstPositionalIndex = findFirstPositionalIndex(rawArgs);
  if (firstPositionalIndex === -1) {
    return { kind: "help" };
  }

  const firstPositional = rawArgs[firstPositionalIndex];
  if (isLoginLikeCommand(firstPositional)) {
    return {
      kind: "login",
      rawArgs: removeArgAt(rawArgs, firstPositionalIndex),
    };
  }

  return { kind: "search", rawArgs };
}
