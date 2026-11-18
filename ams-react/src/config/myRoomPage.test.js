import { describe, it, expect } from 'vitest';
import {
  MY_ROOM_SECTIONS, parseMyRoomLayout, parseGarbageSchedule, encodeGarbageSchedule,
  collectionsOn, sortGarbageRows, mondayIndex,
} from './myRoomPage.js';

const ids = (layout) => layout.sections.map((s) => s.id);

describe('parseMyRoomLayout', () => {
  it('reads nothing as every section, shown, in the default order', () => {
    for (const raw of [undefined, null, '', 'not json', '[]', {}, { sections: 'x' }]) {
      const layout = parseMyRoomLayout(raw);
      expect(ids(layout)).toEqual(MY_ROOM_SECTIONS.map((s) => s.id));
      expect(layout.sections.every((s) => s.show)).toBe(true);
    }
  });

  it('keeps the saved order and switches, and appends a section missing from it', () => {
    const layout = parseMyRoomLayout(JSON.stringify({ sections: [
      { id: 'houseRules', show: false }, { id: 'room', show: true }, { id: 'garbage', show: false },
    ] }));
    expect(ids(layout).slice(0, 3)).toEqual(['houseRules', 'room', 'garbage']);
    expect(layout.sections.slice(0, 3).map((s) => s.show)).toEqual([false, true, false]);
    expect(layout.sections).toHaveLength(MY_ROOM_SECTIONS.length);
    expect(layout.sections.slice(3).every((s) => s.show)).toBe(true);
  });

  it('drops unknown and repeated ids, and never hides the room tag', () => {
    const layout = parseMyRoomLayout({ sections: [{ id: 'bogus' }, { id: 'room', show: false }, { id: 'room', show: true }, { id: 'garbage', show: false }, { id: 'garbage', show: true }] });
    expect(ids(layout).filter((id) => id === 'room')).toHaveLength(1);
    expect(ids(layout)).not.toContain('bogus');
    expect(layout.sections.find((s) => s.id === 'room').show).toBe(true);
    expect(layout.sections.find((s) => s.id === 'garbage').show).toBe(false);
  });
});

describe('garbage schedule', () => {
  const rows = parseGarbageSchedule(JSON.stringify([
    { day: 'Friday', what: ' Residual ', time: '6 PM', period: 'evening' },
    { day: 'Every day', what: 'Common area cleaning' },
    { day: 'Friday', what: 'Recyclables', time: '', period: 'morning' },
    { day: 'Funday', what: 'Trash' },
    { day: 'Monday', what: '   ' },
    { day: 'Monday', what: 'Bio', period: 'midnight' },
  ]));

  it('keeps valid rows, trimmed, with an unknown period read as none', () => {
    expect(rows).toEqual([
      { day: 'Friday', what: 'Residual', time: '6 PM', period: 'evening' },
      { day: 'Every day', what: 'Common area cleaning', time: '', period: '' },
      { day: 'Friday', what: 'Recyclables', time: '', period: 'morning' },
      { day: 'Monday', what: 'Bio', time: '', period: '' },
    ]);
    expect(parseGarbageSchedule('nope')).toEqual([]);
  });

  it('lists a weekday morning first, with the every-day rows', () => {
    expect(collectionsOn(rows, 4).map((r) => r.what)).toEqual(['Recyclables', 'Residual', 'Common area cleaning']);
    expect(collectionsOn(rows, 1).map((r) => r.what)).toEqual(['Common area cleaning']);
  });

  it('sorts Every day first, then Monday to Sunday', () => {
    expect(sortGarbageRows(rows).map((r) => r.day)).toEqual(['Every day', 'Monday', 'Friday', 'Friday']);
  });

  it('encodes what the admin typed without dropping rows', () => {
    expect(encodeGarbageSchedule([{ day: 'Monday', what: '  ', time: ' 6 AM ', period: 'morning' }]))
      .toEqual([{ day: 'Monday', what: '', time: '6 AM', period: 'morning' }]);
  });

  it('counts Monday as the first day of the week', () => {
    expect(mondayIndex(new Date(2026, 10, 16))).toBe(0); // a Monday
    expect(mondayIndex(new Date(2026, 10, 15))).toBe(6); // a Sunday
  });
});
