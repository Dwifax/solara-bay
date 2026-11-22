// A tiny publish/subscribe bus so systems can react to each other (crimes, kills, mission steps)
// without importing one another.

export function createEventBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {
        const list = handlers.get(name);
        const index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
      };
    },
    emit(name, payload) {
      const list = handlers.get(name);
      if (!list) return;
      for (const fn of list.slice()) fn(payload);
    },
  };
}
