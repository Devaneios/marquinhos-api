// Generalizes the per-userId disconnect-grace pattern inline in PongSession
// (a Map<userId, Timeout> armed on disconnect, disarmed on reconnect, firing
// a forfeit callback on expiry) so a future turn-based/reconnect-sensitive
// game can reuse it instead of reimplementing the timer bookkeeping.
export class DisconnectGraceTimer<TKey = string> {
  private timers = new Map<TKey, ReturnType<typeof setTimeout>>();

  // Arming a key that's already armed replaces its timer rather than
  // stacking a second one, so re-arming always means "restart the grace
  // period", never "fire twice".
  arm(key: TKey, delayMs: number, onExpire: () => void): void {
    this.disarm(key);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      onExpire();
    }, delayMs);
    this.timers.set(key, timer);
  }

  disarm(key: TKey): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  isArmed(key: TKey): boolean {
    return this.timers.has(key);
  }
}
