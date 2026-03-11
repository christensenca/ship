#!/usr/bin/env node

import path from 'node:path';
import { collectTypeSafetyMetrics, relativePath, writeTypeSafetyOutputs } from './type-safety-lib.mjs';

const ROOT = process.cwd();

function main() {
  const report = collectTypeSafetyMetrics(ROOT);
  const paths = writeTypeSafetyOutputs(ROOT, report, { appendHistory: true });

  console.log(`Wrote ${relativePath(ROOT, paths.latest_md_path)}`);
  console.log(`Wrote ${relativePath(ROOT, paths.latest_json_path)}`);
  console.log(`Appended ${relativePath(ROOT, paths.history_path)}`);
}

main();
