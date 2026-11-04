// house_rules.php: scope=all returns house, children/pets and parking rules together.
import { describe, it, expect, beforeAll } from 'vitest';
import { api } from './lib/api.js';
import { q } from './lib/db.js';

const rules = (query) => api('house_rules.php', { query });

describe('house rules scope=all', () => {
  let inactiveId;
  beforeAll(async () => {
    const res = await q("INSERT INTO house_rules (category, title, description, is_active, sort_order, scope) VALUES ('Parking', 'Hidden parking rule', 'Inactive', 0, 1, 'parking')");
    inactiveId = res.insertId;
  });

  it('returns every scope, house first, then children and pets, then parking', async () => {
    const { status, body } = await rules({ scope: 'all' });
    expect(status).toBe(200);
    const scopes = body.rules.map((r) => r.scope);
    expect(new Set(scopes)).toEqual(new Set(['house', 'minors', 'parking']));
    const order = ['house', 'minors', 'parking'];
    const idx = scopes.map((s) => order.indexOf(s));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('leaves out inactive rules', async () => {
    const { body } = await rules({ scope: 'all' });
    expect(body.rules.some((r) => r.id === inactiveId)).toBe(false);
  });

  it('a single scope still returns only that scope', async () => {
    const { body } = await rules({ scope: 'parking' });
    expect(body.rules.length).toBeGreaterThan(0);
    expect(body.rules.every((r) => r.scope === 'parking')).toBe(true);
  });

  it('every starter rule has Filipino text, so Filipino mode never mixes in English', async () => {
    const { body } = await rules({ scope: 'all' });
    const missing = body.rules.filter((r) => !r.title_fil?.trim() || !r.description_fil?.trim()).map((r) => r.title);
    expect(missing).toEqual([]);
    expect(body.rules.filter((r) => r.scope === 'house').length).toBeGreaterThanOrEqual(4);
  });

  it('an unknown scope is refused', async () => {
    const { status } = await rules({ scope: 'bogus' });
    expect(status).toBe(422);
  });
});
