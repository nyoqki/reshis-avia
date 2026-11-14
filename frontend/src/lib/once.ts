const claimed = new Set<string>();

/** True only on the first call per key in this page load. */
export function claimOnce(key: string): boolean {
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
}

export function resetOnceForTests(): void {
  claimed.clear();
}
