import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiRoot = join(__dirname, '../..');
const repoRoot = join(__dirname, '../../..');

let loaded = false;

export function loadLocalEnv(): void {
  if (loaded) return;

  // Load API-local env first so worktree-specific DATABASE_URL wins over repo-root defaults.
  const envFiles = [
    join(apiRoot, '.env.local'),
    join(repoRoot, '.env.local'),
    join(apiRoot, '.env'),
    join(repoRoot, '.env'),
  ];

  for (const path of envFiles) {
    config({ path });
  }

  loaded = true;
}
