import { readFileSync, writeFileSync } from "node:fs";

import { injectMatrix, readRules, renderMatrix } from "./render.js";

const DOCUMENT = new URL("../../../docs/non-ts-languages.md", import.meta.url);

const markdown = readFileSync(DOCUMENT, "utf8");
writeFileSync(
  DOCUMENT,
  injectMatrix({
    markdown,
    table: renderMatrix(readRules())
  })
);
