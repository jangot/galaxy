import type { Player } from './player';
import type { Shot } from './shot';

/**
 * Test-only. Import from *.test.ts only. The player's single shot in flight, or null.
 * Throws on two or more: also checks that without doubleShot there is at most one shot.
 */
export function onlyShot(player: Player): Shot | null {
  const { shots } = player;
  if (shots.length > 1) throw new Error(`expected at most one shot, got ${shots.length}`);
  return shots[0] ?? null;
}
