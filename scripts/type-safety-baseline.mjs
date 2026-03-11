#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensureDir, relativePath } from './type-safety-lib.mjs';

const ROOT = process.cwd();
const WORKTREES_DIR = path.join(ROOT, '.worktrees');
const NODE_MODULE_PATHS = [
  'node_modules',
  'api/node_modules',
  'web/node_modules',
  'shared/node_modules',
];

function git(args, cwd = ROOT) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function main() {
  const label = 'baseline';
  ensureDir(WORKTREES_DIR);
  const cloneDir = path.join(WORKTREES_DIR, `type-safety-${Date.now()}`);

  try {
    git(['clone', '--quiet', '--no-local', ROOT, cloneDir], ROOT);
    for (const relativeModulePath of NODE_MODULE_PATHS) {
      const sourcePath = path.join(ROOT, relativeModulePath);
      const targetPath = path.join(cloneDir, relativeModulePath);
      if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) continue;
      ensureDir(path.dirname(targetPath));
      fs.symlinkSync(sourcePath, targetPath, 'dir');
    }
    execFileSync(process.execPath, [
      path.join(ROOT, 'scripts', 'type-safety-snapshot.mjs'),
      '--label',
      label,
      '--output-root',
      ROOT,
      '--no-update-latest',
    ], {
      cwd: cloneDir,
      stdio: 'inherit',
      env: process.env,
    });
  } finally {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }

  console.log(`Captured clean baseline from ${relativePath(ROOT, cloneDir)}`);
}

main();
