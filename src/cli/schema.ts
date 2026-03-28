import path from "node:path";

import { z } from "zod";

import { defaultUserDataDir } from "../search/browser.js";
import type { LoginCommandOptions, SearchCommandOptions } from "./types.js";

const positiveInteger = (name: string) =>
  z.coerce
    .number({ error: `${name} must be a number` })
    .int({ error: `${name} must be an integer` })
    .positive({ error: `${name} must be greater than zero` });

const nonEmptyString = (name: string) => z.string().trim().min(1, `${name} is required`);

const defaultedString = (name: string, fallback: string) => nonEmptyString(name).optional().default(fallback);

const sharedSchema = z.object({
  gl: defaultedString("gl", "us").transform((value) => value.toLowerCase()),
  headed: z.boolean().default(false),
  json: z.boolean().default(false),
  lang: defaultedString("lang", "en"),
  userDataDir: defaultedString("userDataDir", defaultUserDataDir())
    .transform((value) => path.resolve(value)),
});

const searchSchema = sharedSchema.extend({
  num: positiveInteger("num").default(3),
  parallel: positiveInteger("parallel").default(4),
  queries: z.array(nonEmptyString("query")).min(1, "At least one query is required"),
});

const loginSchema = sharedSchema.omit({ headed: true, json: true });

type RawSearchInput = {
  gl?: string;
  headed?: boolean;
  json?: boolean;
  lang?: string;
  num?: string | number;
  parallel?: string | number;
  userDataDir?: string;
  _?: string[];
};

type RawLoginInput = {
  gl?: string;
  lang?: string;
  userDataDir?: string;
};

function trimQueries(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function toZodMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("\n");
}

export function normalizeSearchOptions(input: RawSearchInput): SearchCommandOptions {
  const result = searchSchema.safeParse({
    gl: input.gl,
    headed: input.headed,
    json: input.json,
    lang: input.lang,
    num: input.num,
    parallel: input.parallel,
    queries: trimQueries(input._ ?? []),
    userDataDir: input.userDataDir,
  });

  if (!result.success) {
    throw new Error(toZodMessage(result.error));
  }

  return result.data satisfies SearchCommandOptions;
}

export function normalizeLoginOptions(input: RawLoginInput): LoginCommandOptions {
  const result = loginSchema.safeParse({
    gl: input.gl,
    lang: input.lang,
    userDataDir: input.userDataDir,
  });

  if (!result.success) {
    throw new Error(toZodMessage(result.error));
  }

  return result.data satisfies LoginCommandOptions;
}
