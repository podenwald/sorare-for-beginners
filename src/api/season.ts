export function getCurrentSeasonStartYear(now: Date = new Date()): number {
  const month = now.getMonth()
  const year = now.getFullYear()
  return month >= 8 ? year : year - 1
}
