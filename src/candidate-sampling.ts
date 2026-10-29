export const CANDIDATE_LIMIT = 1600;
/** Floyd sampling: at most limit distinct indices, uniformly drawn from the entire product. */
export function sampleCombinationIndices(recordCount: number, random = Math.random, limit = CANDIDATE_LIMIT): number[] {
  const total = recordCount * recordCount * 3;
  if (!Number.isSafeInteger(total) || recordCount < 1 || !Number.isInteger(recordCount) || !Number.isInteger(limit) || limit < 1) throw new Error('잘못된 후보 범위입니다.');
  if (total <= limit) return Array.from({length:total}, (_, i) => i);
  const chosen = new Set<number>();
  for (let end = total - limit; end < total; end++) {
    const draw = Math.min(end, Math.max(0, Math.floor(random() * (end + 1))));
    chosen.add(chosen.has(draw) ? end : draw);
  }
  return [...chosen];
}
