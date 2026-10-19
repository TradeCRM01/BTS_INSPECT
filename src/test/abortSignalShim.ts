const g = globalThis as typeof globalThis & {
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
};

if (typeof g.AbortSignal === 'function') {
  if (typeof g.AbortSignal.timeout !== 'function') {
    Object.defineProperty(g.AbortSignal, 'timeout', {
      configurable: true,
      value(ms: number) {
        const controller = new g.AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        controller.signal.addEventListener('abort', () => clearTimeout(timer));
        return controller.signal;
      },
    });
  }
  if (typeof g.AbortSignal.any !== 'function') {
    Object.defineProperty(g.AbortSignal, 'any', {
      configurable: true,
      value(signals: AbortSignal[]) {
        const controller = new g.AbortController();
        for (const signal of signals) {
          if (signal.aborted) {
            controller.abort(signal.reason);
            break;
          }
          signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
        }
        return controller.signal;
      },
    });
  }
}
