export const JOB_ID_BATCH = 100;

export function chunkIds<T>(ids: readonly T[], size = JOB_ID_BATCH): T[][] {
  if (size < 1) throw new Error('batch size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
