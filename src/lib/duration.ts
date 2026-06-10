export const EPISODE_DURATION_TARGET_SECONDS = 110;
export const EPISODE_DURATION_MIN_SECONDS = EPISODE_DURATION_TARGET_SECONDS;
export const EPISODE_DURATION_MAX_SECONDS = EPISODE_DURATION_TARGET_SECONDS;

export const STORYBOARD_SHOT_COUNT_MIN = 8;
export const STORYBOARD_SHOT_COUNT_MAX = 13;

export const SHOT_DURATION_MIN_SECONDS = 4;
export const SHOT_DURATION_MAX_SECONDS = 15;
export const DEFAULT_SHOT_DURATION_SECONDS = 14;

export const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

export const normalizeEpisodeDurationSeconds = (value: unknown) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return EPISODE_DURATION_MIN_SECONDS;
  }

  return clamp(
    Math.round(numericValue),
    EPISODE_DURATION_MIN_SECONDS,
    EPISODE_DURATION_MAX_SECONDS
  );
};

export const normalizeShotDurationSeconds = (value: unknown) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_SHOT_DURATION_SECONDS;
  }

  return clamp(
    Math.round(numericValue),
    SHOT_DURATION_MIN_SECONDS,
    SHOT_DURATION_MAX_SECONDS
  );
};

export const getStoryboardTotalDurationSeconds = <
  T extends { duration?: number | null }
>(shots: T[]) => {
  return shots.reduce((sum, shot) => sum + normalizeShotDurationSeconds(shot.duration), 0);
};

export const normalizeStoryboardShotsToDuration = <T extends { duration?: unknown }>(
  shots: T[],
  {
    targetMin = EPISODE_DURATION_MIN_SECONDS,
    targetMax = EPISODE_DURATION_MAX_SECONDS,
  }: {
    targetMin?: number;
    targetMax?: number;
  } = {}
) => {
  const normalizedShots = shots.map((shot) => ({
    ...shot,
    duration: normalizeShotDurationSeconds(shot.duration),
  }));

  const minTotal = normalizedShots.length * SHOT_DURATION_MIN_SECONDS;
  const maxTotal = normalizedShots.length * SHOT_DURATION_MAX_SECONDS;
  const reachableTargetMin = Math.max(targetMin, minTotal);
  const reachableTargetMax = Math.min(targetMax, maxTotal);

  if (normalizedShots.length === 0 || reachableTargetMin > reachableTargetMax) {
    return null;
  }

  let total = normalizedShots.reduce((sum, shot) => sum + shot.duration, 0);

  if (total > reachableTargetMax) {
    for (let index = normalizedShots.length - 1; index >= 0 && total > reachableTargetMax; index -= 1) {
      const shot = normalizedShots[index];
      const reducible = shot.duration - SHOT_DURATION_MIN_SECONDS;

      if (reducible <= 0) continue;

      const delta = Math.min(reducible, total - reachableTargetMax);
      shot.duration -= delta;
      total -= delta;
    }
  }

  if (total < reachableTargetMin) {
    for (let index = 0; index < normalizedShots.length && total < reachableTargetMin; index += 1) {
      const shot = normalizedShots[index];
      const increasable = SHOT_DURATION_MAX_SECONDS - shot.duration;

      if (increasable <= 0) continue;

      const delta = Math.min(increasable, reachableTargetMin - total);
      shot.duration += delta;
      total += delta;
    }
  }

  return total >= reachableTargetMin && total <= reachableTargetMax ? normalizedShots : null;
};

export const normalizeStoryboardShots = <T extends { duration?: unknown }>(
  shots: T[]
) => normalizeStoryboardShotsToDuration(shots);
