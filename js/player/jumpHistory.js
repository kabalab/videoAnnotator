import { Emitter } from '../core/emitter.js';

// Browser-style "back" for deliberate timestamp jumps. Plain scrubbing never records history.
export function createJumpHistory({ limit = 20, dedupe = 2 } = {}) {
  const em = new Emitter();
  let stack = [];
  const top = () => (stack.length ? stack[stack.length - 1] : null);

  return {
    push(from, to) {
      if (!Number.isFinite(from) || Math.abs(from - to) < dedupe) return false;
      stack.push(from);
      if (stack.length > limit) stack.shift();
      em.emit('change', top());
      return true;
    },
    pop() {
      const v = stack.pop();
      em.emit('change', top());
      return v ?? null;
    },
    peek: top,
    clear() {
      stack = [];
      em.emit('change', null);
    },
    get size() {
      return stack.length;
    },
    on: (e, fn) => em.on(e, fn),
  };
}
