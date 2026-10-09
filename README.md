# Video Annotator

A local-first website for taking timestamped notes on videos. Plain HTML, CSS and JavaScript with no build step, so the same folder runs on your computer and on GitHub Pages.

- **Locally** you get full editing: add, edit and delete notes, manage tags and markers, add videos, and see private notes.
- **On GitHub Pages** the site is a read-only viewer until you sign in from **Settings** with the editor code. That code is `editorCode` in [`js/config.js`](js/config.js). Signing in turns on editing and private notes in that browser and keeps you signed in. It does not connect a project folder, and videos still play from their YouTube links.

The environment is detected automatically from the address in the browser (see `envRules` in [`js/config.js`](js/config.js)). Unknown addresses default to the read-only public mode.

## Running it locally

The browser won't load the app's modules from a double-clicked `index.html` (`file://`), so serve the folder:

1. **Live Server (recommended).** Install the Live Server extension in VS Code or Cursor, open this folder, then click **Go Live** in the status bar. The included `.vscode/settings.json` stops Live Server from reloading the page every time the app saves a JSON file.
2. **Or Python:** `python -m http.server 5500`, then open <http://localhost:5500>.
3. **Or Node:** `npx serve .`

Any of `localhost`, `127.0.0.1`, `*.local` or a private network address (192.168.x.x and so on) counts as local.

### Use Chrome or Edge for direct saving

Saving straight into the JSON files uses the File System Access API, which only Chromium browsers (Chrome, Edge, Brave, Opera) support. The Cursor/VS Code built-in browser may not expose it.

The first time, click **Connect folder** and choose this project folder (the one containing `index.html`). The browser remembers it; after a restart it may ask you to click **Allow** once.

### When direct saving isn't available

In Firefox, Safari, the built-in editor browser, or if writing fails, nothing is lost:

1. Every edit is stored as a **draft** in this browser and the UI shows an **unsaved** count.
2. A banner explains why saving failed and includes the exact error message.
3. Open **Settings → Unsaved drafts** and click **Download** (or **Download all**). Each file downloads with a name like `sample-bbb.json`.
4. Move each file to the path shown (for example `data/videos/sample-bbb.json`), replacing the old one.
5. Reload. Drafts clear themselves once the project file matches.

You can also copy every unsaved change as one **change code** from **Settings → Unsaved drafts**. Paste that code later in the same place to reapply the changes, including on another computer. Drafts that are not in the code stay as they are. If the project folder is connected when you import, the app writes those files. If writing fails, the changes stay as drafts in the browser.

## Videos

Large video files (several GB) stay **out of git**. The `videos/` folder is ignored except for `.gitkeep`.

Each video can have two sources:

| Source | Used when |
| --- | --- |
| Local file (`videos/…`) | Running locally and the file loads |
| Backup YouTube link | On GitHub Pages, or locally when the file is missing, unsupported, or stalls for 8 seconds |

The player switches automatically, keeps the current position, and shows why it switched. The **Local / YouTube** menu in the controls switches manually. If the YouTube upload has a different intro length, set **Offset (seconds)** in the video dialog. For example, 5 means YouTube's 0:15 matches the local 0:10.

Add a video from **Library → Add video**. You can pick a file already in `videos/`, copy a file in (with progress), or add a YouTube-only entry.

### Prepare files for smooth seeking

MP4 (H.264 + AAC) works everywhere. Moving the index to the front of the file makes seeking instant:

```bash
ffmpeg -i input.mov -c copy -movflags +faststart output.mp4
```

If the codec isn't supported (for example some MKV or HEVC files), re-encode:

```bash
ffmpeg -i input.mkv -c:v libx264 -crf 20 -preset medium -c:a aac -movflags +faststart output.mp4
```

### OneDrive warning

This folder lives in OneDrive. Multi-GB videos inside a synced folder can upload for hours, and "Files On-Demand" may leave them as online-only placeholders that fail to play. Two options:

- Right-click `videos/` and choose **Always keep on this device**, and consider excluding it from sync.
- Or keep videos in a folder outside OneDrive (for example `C:\Videos`) and connect it in **Settings → External videos folder** (shown once the project folder is connected). Files there are used as if they were in `videos/`.

## Sample data

The project ships with two Blender open movies (CC BY) as examples: `sample-bbb` (Big Buck Bunny) and `sample-spring` (Spring). They play from YouTube out of the box. To try local playback, download the films, convert them as above, and save them as:

- `videos/big-buck-bunny.mp4` from <https://download.blender.org/peach/bigbuckbunny_movies/>
- `videos/spring.mp4` from <https://studio.blender.org/films/spring/>

Some YouTube uploads (for example Blender's *Sintel* and *Tears of Steel*) refuse to play in embedded players, probably because of age restrictions. If a backup link shows "YouTube won't play this video in embedded players", pick a different upload or rely on the local file.

**To remove the samples:** delete `data/videos/sample-*.json`, and in `data/library.json` change `"videos"` to `[]`. Edit or replace the tags and markers in `data/descriptors.json` (or in the app via the tag button).

## Deploying to GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to *Deploy from a branch*, pick your branch and the `/ (root)` folder.
3. The included `.nojekyll` file makes Pages serve the files as-is.

Videos without a YouTube link, and private videos, don't appear on the public site until someone signs in. Open **Settings**, enter the editor code from `editorCode` in [`js/config.js`](js/config.js), and editing works in that browser the way it does locally, except the project folder cannot be connected. Change the code in that file whenever you want; anyone who can read the repository can see it. Before pushing, use **Settings → Preview public site** (or add `?env=public` to the address) to see exactly what visitors will see, including signing in from **Settings** with the editor code. Folder linking stays off in that preview.

> **Private notes are hidden, not secret.** They're filtered out of the public interface, but they're still in the JSON files that Pages serves. Anyone who opens `data/videos/….json` can read them. Don't put anything sensitive in a repository that's published.

## Using the app

- **Edit / View** (top bar, when running locally or signed in): View mode hides the editing buttons for distraction-free watching. Private notes still show. The unsaved count stays in the top bar and hides while the player is fullscreen.
- **Timestamp notes** start at the current playback time. Click a time to jump; **Go back** returns to where you were before the jump.
- **General notes** are about the whole video and support multiple paragraphs (leave a blank line).
- **Tags** are colored labels. The **Tags** page lists every note with that tag across all videos. **Markers** are viewing sessions like "First watch" or "October 2026"; the **Markers** page lists every note from a session across all videos.
- **Search** (`/`) looks through every video's notes, titles and descriptions. Filter by video, type, tag, marker and visibility. Filters are kept in the URL, so results can be bookmarked.
- **Deleting** a note shows an **Undo** button for a few seconds. The deletion is written to the file immediately, and Undo writes the note back.
- **Fullscreen** (`F`) keeps a quick-notes panel beside the video, or along the bottom when the player is narrow. Press `C` to show or hide that panel, and `N` to add a note without leaving fullscreen. The **Notes** button in the controls does the same thing. If the browser blocks fullscreen, theater mode fills the window and keeps that panel.
- **Settings → Data issues** lists anything in the JSON files that couldn't be read. Broken items are kept untouched in the file rather than deleted.

### Keyboard shortcuts (video page)

| Key | Action |
| --- | --- |
| `Space` / `K` | Play / pause |
| `J` / `L` | Back / forward 10 seconds |
| `←` / `→` | Back / forward 5 seconds |
| `N` | New timestamp note at the current time |
| `G` | New general note |
| `B` | Go back to where you were before the last jump |
| `F` | Fullscreen (notes panel available) |
| `C` | Show or hide the notes panel (fullscreen or theater) |
| `M` | Mute |
| `/` | Focus search (any page) |
| `?` | Open help (any page). Editing shortcuts are hidden in View mode and on the public site |
| `Ctrl+Enter` | Save the note being edited |
| `Esc` | Close the editor or dialog |

Shortcuts are ignored while typing in a text field.

## Data format

All data is plain JSON in `data/`. Files are written with stable key order and 2-space indentation so git diffs stay readable.

`data/library.json` lists which videos exist, in display order:

```json
{ "schemaVersion": 1, "videos": ["sample-bbb", "sample-spring"] }
```

`data/videos/<id>.json` holds one video and its notes:

```json
{
  "schemaVersion": 1,
  "id": "sample-bbb",
  "title": "Big Buck Bunny",
  "description": "",
  "visibility": "public",
  "sources": { "local": "videos/big-buck-bunny.mp4", "youtube": "aqz-KE-bpKQ", "offsetSeconds": 0 },
  "createdAt": "2026-04-01T18:00:00Z",
  "updatedAt": "2026-10-07T19:00:00Z",
  "notes": [
    {
      "id": "n_ab12cd34",
      "type": "timestamp",
      "timestamp": 72,
      "title": "",
      "content": "Paragraph one.\n\nParagraph two.",
      "tags": ["important"],
      "markers": ["first-watch"],
      "visibility": "public",
      "createdAt": "2026-04-01T18:05:00Z",
      "updatedAt": "2026-04-01T18:05:00Z"
    }
  ]
}
```

- `type` is `"timestamp"` (with `timestamp` in seconds) or `"generic"` (with `timestamp: null`).
- `markers` holds at most one marker id. Tags are not limited.
- `visibility` is `"public"` or `"private"`, on both videos and notes.
- `sources.local` and `sources.youtube` are both optional. `youtube` is the 11-character video id; full YouTube URLs pasted into the app are converted automatically.

`data/descriptors.json` holds the global tags and markers:

```json
{
  "schemaVersion": 1,
  "tags": [{ "id": "important", "name": "Important", "color": "#4f7cff", "description": "" }],
  "markers": [{ "id": "first-watch", "name": "First Watch", "description": "", "date": "2026-04-01", "order": 1 }]
}
```

Notes refer to tags and markers by `id`, so renaming one updates every note at once.

## Project layout

```
index.html          app shell
css/                tokens (colors, spacing), base, layout, components, player, views
js/config.js        environment rules, paths, player settings
js/core/            environment detection, store, router, DOM and time helpers
js/data/            schema, validation, visibility filter, repository (all reads and writes)
js/storage/         HTTP loading, File System Access, drafts, downloads
js/player/          player shell, HTML5 and YouTube adapters, controls, jump history
js/features/        library, video page, notes, tags/markers, search, tags, markers, settings
js/ui/              top bar, modals, toasts, banners, icons
data/               library.json, descriptors.json, videos/*.json
videos/             local video files (not committed)
```
