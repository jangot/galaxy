import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH, TICK_SECONDS } from '../config';
import { createRng } from '../engine/rng';
import { LIFE_ICON_SPRITE } from './art';
import { Battle } from './battle';
import { NO_POWER_UPS } from './bonus';
import { CAPSULE_SPRITES } from './bonus-art';
import { CHAR_ADVANCE, GLYPH_HEIGHT, textWidth } from './font';
import {
  formatLevel,
  formatScore,
  HUD_HEIGHT,
  HUD_LABEL_Y,
  HUD_VALUE_Y,
  HUD_ZONES,
  hudView,
  LEVEL_LABEL,
  LEVEL_ZONE,
  levelValueX,
  LIFE_ICON_MAX_SIZE,
  LIFE_ICON_STEP,
  LIVES_ICON_SLOTS,
  LIVES_ZONE,
  POWER_UP_SLOT_KINDS,
  POWER_UP_SLOT_X,
  POWER_UPS_ZONE,
  SCORE_DIGITS,
  SCORE_LABEL,
  SCORE_ZONE,
} from './hud';
import { MAX_LIVES, START_LIVES } from './player';
import { TWO_LEVELS } from './test-levels';
import { onlyShot } from './test-shots';

describe('formatting', () => {
  it('pads the score to six digits and keeps longer numbers whole', () => {
    expect(formatScore(0)).toBe('000000');
    expect(formatScore(123)).toBe('000123');
    expect(formatScore(1234567)).toBe('1234567');
  });

  it('prints the level as a plain number', () => {
    expect(formatLevel(1)).toBe('1');
    expect(formatLevel(12)).toBe('12');
  });
});

describe('hudView', () => {
  it.each([1, 3])(
    "shows the battle level %i, score 0, the player's lives and no power-ups",
    (startLevel) => {
      const battle = new Battle(createRng(1), { levels: TWO_LEVELS, startLevel });
      expect(hudView(battle)).toEqual({
        level: startLevel,
        score: 0,
        lives: START_LIVES,
        powerUps: NO_POWER_UPS,
      });
    },
  );

  it("follows the player's lives", () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.player.hit();
    expect(hudView(battle).lives).toBe(START_LIVES - 1);
    expect(hudView(new Battle(createRng(1), { levels: TWO_LEVELS, lives: 5 })).lives).toBe(5);
  });

  it('follows the battle score', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    const fire = { move: 0, fire: true } as const;
    battle.player.ship.x = 40; // shot column x = 47: the corner drone
    battle.update(TICK_SECONDS, fire);
    onlyShot(battle.player)!.y = 42;
    battle.update(TICK_SECONDS, fire);
    expect(battle.wave.enemies[0]!.state).toBe('exploding');
    expect(hudView(battle).score).toBe(battle.score);
    expect(hudView(battle).score).toBe(30);
  });

  it.each(['fastShot', 'doubleShot'] as const)("follows the player's power-up %s", (kind) => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.player.grantPowerUp(kind);
    expect(hudView(battle).powerUps).toEqual({ ...NO_POWER_UPS, [kind]: true });
  });

  it('shows both power-ups and keeps them after a hit', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.player.grantPowerUp('fastShot');
    battle.player.grantPowerUp('doubleShot');
    battle.player.hit();
    expect(hudView(battle).powerUps).toEqual({ fastShot: true, doubleShot: true });
  });
});

describe('layout', () => {
  it('keeps every zone on integer coordinates inside the HUD strip', () => {
    for (const z of HUD_ZONES) {
      for (const v of [z.x, z.y, z.width, z.height]) expect(Number.isInteger(v)).toBe(true);
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
      expect(z.x + z.width).toBeLessThanOrEqual(SCREEN_WIDTH);
      expect(z.y + z.height).toBeLessThanOrEqual(HUD_HEIGHT);
    }
  });

  it('has no overlapping zones', () => {
    for (let i = 0; i < HUD_ZONES.length; i++) {
      for (let j = i + 1; j < HUD_ZONES.length; j++) {
        const a = HUD_ZONES[i]!;
        const b = HUD_ZONES[j]!;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `zones ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('stays above the highest enemy pixel', () => {
    // Free strip above the formation: the highest enemy pixel is an explosion at the peel
    // apex, top y = 29 (drone row 0: slot y 34, 4 px up, frame 9 px tall centered -> -1).
    // <= 28 keeps at least 1 px between the HUD and it; a limit for future sections too.
    expect(HUD_HEIGHT).toBeLessThanOrEqual(28);
  });

  it('includes the power-ups zone', () => {
    expect(HUD_ZONES).toContain(POWER_UPS_ZONE);
  });

  it('puts the power-ups zone on the value row', () => {
    expect(POWER_UPS_ZONE.y).toBe(HUD_VALUE_Y);
    expect(POWER_UPS_ZONE.height).toBeGreaterThanOrEqual(LIFE_ICON_MAX_SIZE);
  });

  it('keeps the label row above the value row', () => {
    expect(HUD_LABEL_Y + GLYPH_HEIGHT).toBeLessThanOrEqual(HUD_VALUE_Y);
  });
});

describe('capacity', () => {
  it('fits the score label and six digits', () => {
    expect(SCORE_ZONE.width).toBeGreaterThanOrEqual(textWidth(SCORE_LABEL));
    expect(SCORE_ZONE.width).toBeGreaterThanOrEqual(SCORE_DIGITS * CHAR_ADVANCE);
  });

  it('fits the level label', () => {
    expect(LEVEL_ZONE.width).toBeGreaterThanOrEqual(textWidth(LEVEL_LABEL));
  });

  it.each([1, 9, 10, 99, 999, 99999])('keeps the centered level %i inside its zone', (level) => {
    const text = formatLevel(level);
    const x = levelValueX(text);
    expect(Number.isInteger(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(LEVEL_ZONE.x);
    expect(x + textWidth(text)).toBeLessThanOrEqual(LEVEL_ZONE.x + LEVEL_ZONE.width);
  });

  it.each([
    ['score', SCORE_ZONE],
    ['level', LEVEL_ZONE],
  ])('%s zone spans both text rows', (_name, zone) => {
    expect(zone.y).toBeLessThanOrEqual(HUD_LABEL_Y);
    expect(zone.y + zone.height).toBeGreaterThanOrEqual(HUD_VALUE_Y + GLYPH_HEIGHT);
  });

  it('has an icon slot for every life up to MAX_LIVES', () => {
    expect(LIVES_ICON_SLOTS).toBeGreaterThanOrEqual(MAX_LIVES);
  });

  it('fits all lives icon slots', () => {
    expect(LIVES_ZONE.width).toBeGreaterThanOrEqual(
      (LIVES_ICON_SLOTS - 1) * LIFE_ICON_STEP + LIFE_ICON_MAX_SIZE,
    );
    expect(LIVES_ZONE.height).toBeGreaterThanOrEqual(LIFE_ICON_MAX_SIZE);
  });
});

describe('lives icon', () => {
  it('stays within the size limit and does not overlap its neighbor', () => {
    expect(LIFE_ICON_SPRITE.width).toBeLessThanOrEqual(LIFE_ICON_MAX_SIZE);
    expect(LIFE_ICON_SPRITE.height).toBeLessThanOrEqual(LIFE_ICON_MAX_SIZE);
    expect(LIFE_ICON_MAX_SIZE).toBeLessThanOrEqual(LIFE_ICON_STEP);
    expect(LIFE_ICON_MAX_SIZE).toBeLessThanOrEqual(8); // owner's decision: icon at most 8×8
  });
});

describe('power-up icons', () => {
  it('has exactly one slot for every power-up', () => {
    expect([...POWER_UP_SLOT_KINDS].sort()).toEqual(Object.keys(NO_POWER_UPS).sort());
  });

  it.each(POWER_UP_SLOT_KINDS)('keeps the %s slot inside the zone', (kind) => {
    const x = POWER_UP_SLOT_X[kind];
    expect(Number.isInteger(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(POWER_UPS_ZONE.x);
    expect(x + LIFE_ICON_MAX_SIZE).toBeLessThanOrEqual(POWER_UPS_ZONE.x + POWER_UPS_ZONE.width);
  });

  it('keeps the slots apart', () => {
    for (let i = 1; i < POWER_UP_SLOT_KINDS.length; i++) {
      const prev = POWER_UP_SLOT_X[POWER_UP_SLOT_KINDS[i - 1]!];
      const next = POWER_UP_SLOT_X[POWER_UP_SLOT_KINDS[i]!];
      expect(next - prev).toBeGreaterThanOrEqual(LIFE_ICON_MAX_SIZE);
    }
  });

  it.each(POWER_UP_SLOT_KINDS)('fits the %s capsule sprite into a slot', (kind) => {
    expect(CAPSULE_SPRITES[kind].width).toBeLessThanOrEqual(LIFE_ICON_MAX_SIZE);
    expect(CAPSULE_SPRITES[kind].height).toBeLessThanOrEqual(LIFE_ICON_MAX_SIZE);
  });
});
