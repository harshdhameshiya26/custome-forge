import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const SCHEMA_PATH = path.join(ROOT_DIR, 'prisma', 'schema.prisma');
const CLIENT_DIR = path.join(ROOT_DIR, 'node_modules', '.prisma', 'client');
const CLIENT_SCHEMA = path.join(CLIENT_DIR, 'schema.prisma');
const CLIENT_INDEX = path.join(CLIENT_DIR, 'index.js');

function cleanTmpFiles() {
  try {
    if (fs.existsSync(CLIENT_DIR)) {
      const files = fs.readdirSync(CLIENT_DIR);
      for (const file of files) {
        if (file.includes('.tmp')) {
          try {
            fs.unlinkSync(path.join(CLIENT_DIR, file));
          } catch {
            // Ignore if currently locked by Windows
          }
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

function normalizeSchema(content) {
  return content.replace(/\s+/g, ' ').trim();
}

function isClientUpToDate() {
  try {
    if (!fs.existsSync(CLIENT_INDEX) || !fs.existsSync(CLIENT_SCHEMA)) {
      return false;
    }
    const currentSchema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const generatedSchema = fs.readFileSync(CLIENT_SCHEMA, 'utf8');
    return normalizeSchema(currentSchema) === normalizeSchema(generatedSchema);
  } catch {
    return false;
  }
}

function run() {
  cleanTmpFiles();

  // If client exists and schema matches, skip generation entirely to avoid Windows DLL file-locking collisions
  if (isClientUpToDate()) {
    console.log('✓ Prisma Client is up-to-date with schema. Skipping regeneration.');
    process.exit(0);
  }

  console.log('Generating Prisma Client...');
  const prismaBin = path.join(ROOT_DIR, 'node_modules', 'prisma', 'build', 'index.js');
  const envFile = path.join(ROOT_DIR, 'backend', '.env');

  const args = [];
  if (fs.existsSync(envFile)) {
    args.push(`--env-file-if-exists=${envFile}`);
  }
  args.push(prismaBin, 'generate');

  const result = spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.status === 0) {
    cleanTmpFiles();
    process.exit(0);
  }

  const stderr = result.stderr || '';
  const isEperm =
    stderr.includes('EPERM') ||
    stderr.includes('operation not permitted') ||
    stderr.includes('query_engine');

  if (isEperm && fs.existsSync(CLIENT_INDEX)) {
    console.warn('\n⚠️ [db:generate] Prisma query engine binary is currently locked in memory by another running Node process (e.g., backend server).');
    console.warn('⚠️ [db:generate] Reusing existing Prisma Client. (To apply new schema changes, stop the running backend server and run "npm run db:generate").\n');
    cleanTmpFiles();
    process.exit(0);
  }

  if (stderr) {
    process.stderr.write(stderr);
  }

  cleanTmpFiles();
  process.exit(result.status || 1);
}

run();
