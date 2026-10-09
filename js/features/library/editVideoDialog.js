import { openVideoDialog } from './addVideoDialog.js';

export function openEditVideoDialog(video, { getCurrentTime } = {}) {
  return openVideoDialog({ mode: 'edit', video, getCurrentTime });
}
