import type { PrintableSearchOutcome, PrintableSearchResult } from "./types.js";

export function formatResultLines(result: PrintableSearchResult, index: number): string {
  return [
    `${index}. ${result.title}`,
    result.url,
    ...(result.snippet ? [result.snippet] : []),
  ].join("\n");
}

function printResultGroup(query: string, results: PrintableSearchResult[]): void {
  results.forEach((result, index) => {
    console.log(formatResultLines(result, index + 1));
    if (index !== results.length - 1) {
      console.log("");
    }
  });
}

export function printPlainResults(items: PrintableSearchOutcome[]): void {
  items.forEach((item, itemIndex) => {
    if (items.length > 1) {
      console.log(`[${item.query}]`);
    }

    if (item.error) {
      console.log(`ERROR: ${item.error}`);
    } else {
      printResultGroup(item.query, item.results);
    }

    if (itemIndex !== items.length - 1) {
      console.log("");
    }
  });
}

export function printJsonResults(items: PrintableSearchOutcome[]): void {
  if (items.length === 1) {
    const [item] = items;
    console.log(JSON.stringify(item?.error ? item : item?.results ?? [], null, 2));
    return;
  }

  console.log(JSON.stringify(items, null, 2));
}

export function exitCodeForOutcomes(items: PrintableSearchOutcome[]): number {
  return items.some((item) => item.error) ? 1 : 0;
}
