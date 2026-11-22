import { describe, expect, it } from 'vitest';
import { SAVE_KEY, freshSave, loadSave, nextLevel, parseSave, recordFinish, recordSkip, serializeSave, writeSave } from './save.js';

const fixture = '{"open":4,"levels":{"1":{"stars":3,"fewest":1},"2":{"stars":2,"fewest":3},"3":{"stars":1,"fewest":7}},"tricks":["puff"],"parade":6,"settings":{"muted":true,"music":false,"reducedMotion":null,"longAim":true},"hints":{"flung":true},"v":1}';

describe('the save (§12)', () => {
  it('round-trips the version 1 fixture byte for byte', () => {
    expect(serializeSave(parseSave(fixture))).toBe(fixture);
  });

  it('falls back field by field, and never opens fewer levels than were finished', () => {
    const loaded = parseSave('{"open":"lots","levels":{"2":{"stars":9,"fewest":1},"5":{"stars":2,"fewest":4},"99":{"stars":3,"fewest":1}},"tricks":["thud","rocket"],"parade":-3,"settings":{"muted":"yes","longAim":true}}');
    expect(loaded.save.levels).toEqual({ 5: { stars: 2, fewest: 4 } });
    expect(loaded.save.open).toBe(6);
    expect(loaded.save.tricks).toEqual(['thud']);
    expect(loaded.save.parade).toBe(0);
    expect(loaded.save.settings).toEqual({ muted: false, music: true, reducedMotion: null, longAim: true });
  });

  it('rescues stars, the parade and the open level from corrupt JSON', () => {
    const loaded = parseSave(fixture.slice(0, 120));
    expect(loaded.save.levels[1]).toEqual({ stars: 3, fewest: 1 });
    expect(loaded.save.levels[2]).toEqual({ stars: 2, fewest: 3 });
    expect(loaded.save.open).toBeGreaterThanOrEqual(3);
    expect(parseSave('][').save).toEqual(freshSave());
  });

  it('keeps the fields and version of a save from a newer game', () => {
    const loaded = parseSave('{"v":3,"open":2,"levels":{"1":{"stars":3,"fewest":1}},"costumes":["hat"]}');
    expect(loaded.version).toBe(3);
    expect(JSON.parse(serializeSave(loaded))).toMatchObject({ v: 3, costumes: ['hat'], open: 2 });
  });

  it('plays on when storage is missing or throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSave(throwing).save).toEqual(freshSave());
    expect(() => writeSave(loadSave(throwing), throwing)).not.toThrow();
    expect(loadSave(null).save).toEqual(freshSave());
  });

  it('writes one key only', () => {
    const written = new Map<string, string>();
    writeSave(parseSave(fixture), { getItem: (key) => written.get(key) ?? null, setItem: (key, value) => void written.set(key, value) });
    expect([...written.keys()]).toEqual([SAVE_KEY]);
  });

  it('keeps the best stars and fewest flings, opens the next level and grows the parade', () => {
    const save = freshSave();
    recordFinish(save, 1, 2, 3, 1);
    recordFinish(save, 1, 3, 1, 1);
    recordFinish(save, 1, 1, 9, 1);
    expect(save.levels[1]).toEqual({ stars: 3, fewest: 1 });
    expect(save.open).toBe(2);
    expect(save.parade).toBe(3);
  });

  it('skips with no mark: the next level opens and this one stays unstarred (§5)', () => {
    const save = freshSave();
    recordSkip(save, 1);
    expect(save.open).toBe(2);
    expect(save.levels[1]).toBeUndefined();
    expect(nextLevel(save)).toBe(1);
    recordFinish(save, 1, 1, 8, 1);
    expect(nextLevel(save)).toBe(2);
    recordSkip(save, 20);
    expect(save.open).toBe(20);
  });
});
