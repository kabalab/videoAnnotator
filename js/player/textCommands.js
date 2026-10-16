import { config } from '../config.js';
import { isTypingTarget } from '../core/dom.js';
import { parseTime } from '../core/time.js';

// /t \t pause or play, /q \q and /e \e step, /a \a and /d \d big step, /b \b go back.
// /j1:25 \j1:25 waits for Space, then jumps. The typed command is removed.
export function bindTextCommands(getPlayer) {
  const commands = {
    t: (player) => player.togglePlay(),
    q: (player) => player.seekBy(-config.player.seekStep),
    e: (player) => player.seekBy(config.player.seekStep),
    a: (player) => player.seekBy(-config.player.bigSeekStep),
    d: (player) => player.seekBy(config.player.bigSeekStep),
    b: (player) => player.goBack(),
  };
  let applying = false;

  function commandFor(sigil, letter) {
    if (sigil !== '/' && sigil !== '\\') return null;
    return commands[String(letter || '').toLowerCase()] || null;
  }

  function fieldCaret(el) {
    try {
      if (typeof el.selectionStart !== 'number' || typeof el.selectionEnd !== 'number') return null;
      return { start: el.selectionStart, end: el.selectionEnd };
    } catch {
      return null;
    }
  }

  function isCommandField(el) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
    if (!isTypingTarget(el) || el.hasAttribute('data-no-text-command')) return false;
    return true;
  }

  // /j1:25 or \j1:25, finished by the Space just typed. Returns where that command starts.
  function jumpCommand(value, caret) {
    if (value[caret - 1] !== ' ') return null;
    let i = caret - 2;
    while (i >= 0 && /[\d:.]/.test(value[i])) i -= 1;
    if (i < 1 || value[i].toLowerCase() !== 'j') return null;
    const sigil = value[i - 1];
    if (sigil !== '/' && sigil !== '\\') return null;
    const timeText = value.slice(i + 1, caret - 1);
    const seconds = parseTime(timeText);
    if (seconds == null) return null;
    return { start: i - 1, seconds };
  }

  function onTextCommand(e) {
    if (applying || e.isComposing) return;
    if (e.inputType !== 'insertText' && e.inputType !== 'insertFromPaste' && e.inputType !== 'insertFromDrop') return;
    const el = e.target;
    if (!isCommandField(el) || el.closest('.settings')) return;
    const player = getPlayer();
    if (!player) return;
    const caret = fieldCaret(el);
    if (!caret || caret.start !== caret.end || caret.start < 2) return;
    const fn = commandFor(el.value[caret.start - 2], el.value[caret.start - 1]);
    const jump = fn ? null : jumpCommand(el.value, caret.start);
    if (!fn && !jump) return;
    applying = true;
    try {
      el.setRangeText('', jump ? jump.start : caret.start - 2, caret.start, 'end');
      if (fn) fn(player);
      else player.jumpTo(jump.seconds);
    } finally {
      applying = false;
    }
  }

  document.addEventListener('input', onTextCommand, true);
  return () => document.removeEventListener('input', onTextCommand, true);
}
