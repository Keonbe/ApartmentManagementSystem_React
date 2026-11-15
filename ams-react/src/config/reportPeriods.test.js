import { describe, it, expect } from 'vitest';
import {
  weekOf, rangeFor, shiftRange, periodCount, groupOptions, defaultGroup, presets, rangeLabel, spanLabel, modeOf, isDate,
} from './reportPeriods.js';

describe('ranges', () => {
  it('weeks run Monday to Sunday', () => {
    expect(weekOf('2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' }); // a Sunday
    expect(weekOf('2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // a Monday
    expect(weekOf('2026-01-01')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
  });

  it('builds the month and year around a date', () => {
    expect(rangeFor('month', '2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(rangeFor('year', '2026-11-15')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(rangeFor('days', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' });
  });

  it('steps back and forward', () => {
    expect(shiftRange({ mode: 'month', from: '2026-01-01', to: '2026-01-31' }, -1)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(shiftRange({ mode: 'month', from: '2026-01-01', to: '2026-01-31' }, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(shiftRange({ mode: 'week', from: '2026-11-09', to: '2026-11-15' }, 1)).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(shiftRange({ mode: 'year', from: '2026-01-01', to: '2026-12-31' }, -1)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(shiftRange({ mode: 'days', from: '2026-11-01', to: '2026-11-10' }, -1)).toEqual({ from: '2026-10-22', to: '2026-10-31' });
  });

  it('counts periods like the server', () => {
    expect(periodCount('2026-01-01', '2026-12-31', 'day')).toBe(365);
    expect(periodCount('2025-12-24', '2026-01-10', 'week')).toBe(3);
    expect(periodCount('2026-01-15', '2026-03-10', 'month')).toBe(3);
    expect(periodCount('2020-06-01', '2026-01-01', 'year')).toBe(7);
  });

  it('offers only groupings within the limits, and month or year for utilities', () => {
    const many = groupOptions('2020-01-01', '2026-12-31', 'financial');
    expect(many.find((o) => o.id === 'day').disabled).toBe(true);
    expect(many.find((o) => o.id === 'month').disabled).toBe(false);
    const util = groupOptions('2026-11-01', '2026-11-30', 'utilities');
    expect(util.filter((o) => !o.disabled).map((o) => o.id)).toEqual(['month', 'year']);
  });

  it('picks a default grouping', () => {
    expect(defaultGroup('month', '2026-11-01', '2026-11-30', 'financial')).toBe('day');
    expect(defaultGroup('month', '2026-11-01', '2026-11-30', 'utilities')).toBe('month');
    expect(defaultGroup('year', '2026-01-01', '2026-12-31', 'financial')).toBe('month');
    expect(defaultGroup('days', '2026-01-01', '2026-04-30', 'financial')).toBe('week');
    expect(defaultGroup('days', '2020-01-01', '2026-12-31', 'financial')).toBe('year');
  });
});

describe('words', () => {
  it('names a range', () => {
    expect(rangeLabel({ from: '2026-11-01', to: '2026-11-30' })).toBe('November 2026');
    expect(rangeLabel({ from: '2026-01-01', to: '2026-12-31' })).toBe('2026');
    expect(rangeLabel({ from: '2026-11-09', to: '2026-11-15' })).toBe('Week of Nov 9 – 15, 2026');
    expect(rangeLabel({ from: '2026-10-01', to: '2026-12-31' })).toBe('October – December 2026');
    expect(rangeLabel({ from: '2026-11-03', to: '2026-11-15' })).toBe('Nov 3 – 15, 2026');
    expect(spanLabel('2025-12-29', '2026-01-04')).toBe('Dec 29, 2025 – Jan 4, 2026');
  });

  it('finds the mode of a range from the address bar', () => {
    expect(modeOf('2026-11-09', '2026-11-15')).toBe('week');
    expect(modeOf('2026-02-01', '2026-02-28')).toBe('month');
    expect(modeOf('2026-01-01', '2026-12-31')).toBe('year');
    expect(modeOf('2026-02-01', '2026-02-27')).toBe('days');
  });

  it('checks dates and builds presets', () => {
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-02-28')).toBe(true);
    const p = Object.fromEntries(presets('2026-11-15').map((x) => [x.id, x]));
    expect(p.lastMonth).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(p.thisQuarter).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    expect(p.last7).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
  });
});
