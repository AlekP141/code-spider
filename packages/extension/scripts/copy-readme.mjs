import { copyFileSync } from "node:fs";

copyFileSync(
  new URL("../../../README.md", import.meta.url),
  new URL("../README.md", import.meta.url),
);
