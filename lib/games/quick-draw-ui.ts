export function formatQuickDrawTime(timeLeftMs: number): string {
  return `${(Math.max(0, timeLeftMs) / 1000).toFixed(1)}s`;
}
