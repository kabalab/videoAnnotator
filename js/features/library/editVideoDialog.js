import { openVideoDialog } from './addVideoDialog.js';

export function openEditVideoDialog(video) {
  return openVideoDialog({ mode: 'edit', video });
}
