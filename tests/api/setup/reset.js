// Runs in every test file: start from the freshly seeded ams_test, so files
// never depend on each other. Tests inside one file run in order and may build
// on each other.
import { beforeAll, afterAll } from 'vitest';
import { restoreScratch } from '../lib/mysql.js';
import { closeDb } from '../lib/db.js';

beforeAll(() => restoreScratch());
afterAll(() => closeDb());
