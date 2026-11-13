import { describe, expect, it } from 'vitest';
import { NO_DEV_PARAMS, parseDevParams } from './dev-params';

const seedOf = (v: string): number | null => parseDevParams(`?seed=${v}`).seed;
const shieldOf = (v: string): number | undefined => parseDevParams(`?shield=${v}`).shield;

describe('parseDevParams', () => {
  it('returns the defaults for an empty search', () => {
    expect(parseDevParams('')).toEqual({
      seed: null,
      paused: false,
      startLevel: 1,
      shield: undefined,
    });
  });

  it('parses seed as an integer in 0..2^32-1', () => {
    expect(seedOf('1')).toBe(1);
    expect(seedOf('0')).toBe(0);
    expect(seedOf('4294967295')).toBe(4294967295);
  });

  it.each(['4294967296', '-1', '1.5', 'abc', '0x10', '', '99999999999999999999'])(
    'rejects seed %j',
    (v) => {
      expect(seedOf(v)).toBeNull();
    },
  );

  it('turns paused on only for exactly 1', () => {
    expect(parseDevParams('?paused=1').paused).toBe(true);
    expect(parseDevParams('').paused).toBe(false);
    expect(parseDevParams('?paused=0').paused).toBe(false);
    expect(parseDevParams('?paused=true').paused).toBe(false);
    expect(parseDevParams('?paused=').paused).toBe(false);
  });

  it('parses shield in 0..MAX_SHIELD', () => {
    expect(shieldOf('0')).toBe(0);
    expect(shieldOf('2')).toBe(2);
    expect(shieldOf('5')).toBe(5);
  });

  it.each(['6', '-1', '2.5', 'x', ''])('ignores shield %j', (v) => {
    expect(shieldOf(v)).toBeUndefined();
  });

  it('no longer reads ?lives', () => {
    expect(parseDevParams('?lives=1').shield).toBeUndefined();
    expect(parseDevParams('?lives=1')).toEqual(parseDevParams(''));
  });

  it('combines all parameters', () => {
    expect(parseDevParams('?seed=7&paused=1&level=3&shield=5')).toEqual({
      seed: 7,
      paused: true,
      startLevel: 3,
      shield: 5,
    });
  });

  it('parses level with parseStartLevel', () => {
    expect(parseDevParams('?level=0').startLevel).toBe(1);
  });
});

describe('NO_DEV_PARAMS', () => {
  it('reads nothing', () => {
    expect(NO_DEV_PARAMS).toEqual({
      seed: null,
      paused: false,
      startLevel: undefined,
      shield: undefined,
    });
  });
});
