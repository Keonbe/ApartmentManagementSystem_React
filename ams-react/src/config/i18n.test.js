// The English and Filipino tables must stay in step, and every literal key the
// app looks up must exist (a missing key shows the raw key to the person).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations } from './i18n.js';

const { en, fil } = translations;
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(p);
    return /\.(jsx?|mjs)$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [p] : [];
  });
}

describe('i18n tables', () => {
  it('Filipino has every English key, and no extra ones', () => {
    const enKeys = Object.keys(en);
    const filKeys = new Set(Object.keys(fil));
    expect(enKeys.filter((k) => !filKeys.has(k))).toEqual([]);
    const enSet = new Set(enKeys);
    expect([...filKeys].filter((k) => !enSet.has(k))).toEqual([]);
  });

  it('each pair uses the same {placeholders}', () => {
    const mismatched = Object.keys(en)
      .filter((k) => k in fil && placeholders(en[k]).join() !== placeholders(fil[k]).join())
      .map((k) => `${k}: en ${placeholders(en[k])} / fil ${placeholders(fil[k])}`);
    expect(mismatched).toEqual([]);
  });

  it('no text is empty', () => {
    expect(Object.entries(en).filter(([, v]) => !String(v).trim()).map(([k]) => k)).toEqual([]);
    expect(Object.entries(fil).filter(([, v]) => !String(v).trim()).map(([k]) => k)).toEqual([]);
  });

  it('every literal t(\'key\') in the app exists', () => {
    const missing = new Set();
    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\b(?:t|translate|textIn\([^,]+,)\s*\(?\s*'([A-Za-z][A-Za-z0-9_]*\.[A-Za-z0-9_./-]+)'/g)) {
        if (!(m[1] in en)) missing.add(`${m[1]}  (${path.relative(SRC, file)})`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
