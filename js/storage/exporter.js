export function downloadText(path, text) {
  const name = path.split('/').pop();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Browsers may block a burst of downloads, so space them out slightly.
export async function downloadMany(files) {
  for (const f of files) {
    downloadText(f.path, f.text);
    await new Promise((r) => setTimeout(r, 350));
  }
}
