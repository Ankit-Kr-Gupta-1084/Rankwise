// Pure client-safe utility for calculating tight, realistic gauge ruler bounds
export function getScaleBounds(targetRank: number): { minR: number; maxR: number } {
  if (!targetRank || targetRank <= 0) return { minR: 0, maxR: 0 };
  let delta = Math.round(targetRank * 0.08);
  if (delta < 150) delta = Math.min(150, Math.max(50, Math.round(targetRank * 0.12)));
  if (delta > 1850) delta = 1850;
  const minR = Math.max(1, targetRank - delta);
  const maxR = targetRank + delta;
  return { minR, maxR };
}

