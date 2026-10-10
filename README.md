# Video Annotator

A local-first website for taking timestamped notes on videos. Plain HTML, CSS and JavaScript with no build step, so the same folder runs on your computer and on GitHub Pages.

- **Locally** you get full editing: add, edit and delete notes, manage tags and markers, add videos, and see private notes.
- **On GitHub Pages** the site is a read-only viewer until you sign in from **Settings** with the editor code. That code is `editorCode` in [`js/config.js`](js/config.js). Signing in turns on editing and private notes in that browser and keeps you signed in. It does not connect a project folder, and videos still play from their YouTube links.

The environment is detected automatically from the address in the browser (see `envRules` in [`js/config.js`](js/config.js)). Unknown addresses default to the read-only public mode.

## Make it yours

You can have your own notes site without installing anything. Copy this project into your GitHub account, turn that copy into a website, choose a sign-in code, and use it in the browser.

### Copy the project

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Open [github.com/kabalab/videoAnnotator](https://github.com/kabalab/videoAnnotator).
3. Click **Fork** at the top of the page. GitHub puts a copy under your name. That copy is yours. The original project stays as it is.

### Turn the copy into a website

1. On your copy, open **Settings**, then **Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose the **main** branch and the **/ (root)** folder, then click **Save**.
4. Wait a minute and refresh. GitHub shows a link like `https://your-name.github.io/videoAnnotator`. Open it and bookmark it. That address is your site.

### Pick your own sign-in code

The site is view-only until someone enters a code. The code that comes with the project is in a file anyone can open, so change it before you share the site.

1. On your copy, click through to the file `js/config.js`.
2. Click the pencil to edit the file.
3. Find the line that starts with `editorCode`. Replace the text between the quotes with a code only you know. Longer is safer. Leave the quotes and the comma in place:

```js
editorCode: 'blue-river-42-maple',
```

4. Click **Commit changes**. Give the site a minute to update.
5. Open your site, click the gear (**Settings**), type that code, and click **Sign in**.

You stay signed in in that browser until you sign out from Settings. **Edit** in the top bar is for adding and changing notes. **View** hides those buttons while you watch. After you sign in, private notes show in both.

### Use the site

- The **Library** is the home page. Click a video to watch it and read its notes. This copy starts with the NYC 2019, 2023 and 2026 sessions with some of them having noted depending on when you copy the repo. To drop one, open it, choose **Edit video**, then **Remove from library**. That removes the entry and its notes. A video file sitting on a computer is left alone.
- **Add video** is how you add your own. Paste a YouTube link. On the website, videos play from YouTube.
- **Timestamp** saves a note at the moment you are watching. **Note** saves one about the whole video. Click a time in a note to jump there.
- Tags are colored labels for what a note is about. Markers record which viewing or session it belongs to. The tag button in the top bar creates them. The **Tags** and **Markers** pages list matching notes from every video.
- Press `?` on any page for help inside the app. The later sections of this page cover shortcuts, formatting, and running a copy on your own computer.

### Keep what you write

On the website, edits stay in that browser. The top bar shows how many are still unsaved. Open **Settings → Unsaved drafts** and click **Copy change code** to get one block of text for those edits. On another computer, open Settings on your site, paste the code, and click **Import change code**.

That is enough if only you need the notes, in that browser. Visitors to the site still see the old pages until the changed files are saved into your GitHub copy.

### Put the changes on the website

1. On your site, open **Settings → Unsaved drafts**. Each line shows a path, such as `data/videos/nyc23-session-1.json`, `data/library.json`, or `data/descriptors.json`.
2. Click **Download** on each line, or **Download all**. The files land in your Downloads folder. The downloaded name is only the last part, like `nyc23-session-1.json`. The path on the line is the folder it belongs in.
3. On GitHub, open your copy of the project.
4. Click through to that folder. Video notes go in `data`, then `videos`. The library list and the tags file both go in `data`.
5. Click **Add file**, then **Upload files**, and drag in the downloaded file. A file that is already there gets replaced. A new video is a new file, so upload that too. Adding or removing a video also changes `data/library.json`, and changing tags or markers changes `data/descriptors.json`. Upload every file in the list.
6. A line that says **delete this file** has no download. Open that file on GitHub, click the trash can, and confirm.
7. Scroll down and click **Commit changes**.
8. Wait a minute, then reload your site. The unsaved count goes away once the site is serving those same files. Stay signed in while you reload so the drafts can clear.

### Or run it on your computer

This way is harder the first time. You install a few tools and connect the project folder once. After that, notes save into the files as you write them, and updating the website is one push instead of downloading and uploading each file.

**The first time**

- **1.** Install [GitHub Desktop](https://desktop.github.com/) and sign in with the GitHub account that owns your copy.
- **2.** In GitHub Desktop, choose **File → Clone repository**, pick your copy of videoAnnotator, and choose a folder on your computer.
- **3.** Install [VS Code](https://code.visualstudio.com/), open that folder, and install the **Live Server** extension.
- **4.** Click **Go Live** in the status bar. A browser tab opens. If the address already says `localhost`, skip the next step.
- **4.5.** Live Server may open `127.0.0.1` when you need `localhost`. In VS Code, open **Settings** with the gear at the bottom left, then **Settings**. Search for `Live Server Host`. In **Live Server › Settings: Host**, replace `127.0.0.1` with `localhost`. Click **Go Live** again. The tab should open at `http://localhost:5500` (the port number can be different).
- **5.** Use Chrome or Edge for that tab. Open **Settings** in the app and click **Connect project folder**. Choose the folder you cloned, the one that contains `index.html`. If the browser asks, allow access. It remembers the folder after that.

Editing is already on when you run it this way, so the sign-in code is only for the public website. More detail on browsers and saving is under [Running it locally](#running-it-locally).

**After it is set up**

1. Open the folder and click **Go Live**.
2. If the browser asks, click **Allow** once so it can write to the project folder again.
3. Add and edit notes as usual. They are written straight into the JSON files, and the unsaved count stays clear when that worked.
4. Open GitHub Desktop. It lists the files that changed. Write a short note about what you changed, click **Commit to main**, then **Push origin**.
5. Wait a minute and reload your website. The new notes are there for anyone who visits.

Private notes are hidden from visitors who are not signed in. The text is still in the project files, so anyone who opens those files can read it. Keep sensitive notes out of the project.

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
3. Open **Settings → Unsaved drafts** and click **Download** (or **Download all**). Each file downloads with a name like `nyc23-session-1.json`.
4. Move each file to the path shown (for example `data/videos/nyc23-session-1.json`), replacing the old one.
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

Add a video from **Library → Add video**. You can pick a file already in `videos/`, copy a file in (with progress), or add a YouTube-only entry. When the player knows the length, it stores it as `duration` on the video so the library can show it.

MP4 (H.264 + AAC) works everywhere. Moving the index to the front of the file makes seeking instant:

```bash
ffmpeg -i input.mov -c copy -movflags +faststart output.mp4
```

If the codec isn't supported (for example some MKV or HEVC files), re-encode:

```bash
ffmpeg -i input.mkv -c:v libx264 -crf 20 -preset medium -c:a aac -movflags +faststart output.mp4
```

## Using the app

- **Edit / View** (top bar, when running locally or signed in): View mode hides the editing buttons for distraction-free watching. Private notes still show. The unsaved count stays in the top bar and hides while the player is fullscreen.
- **Timestamp notes** start at the current playback time. Click a time to jump; **Go back** returns to where you were before the jump. On the timeline, the note you have reached is highlighted and the next one is marked, including on the seek bar.
- **General notes** are about the whole video and support multiple paragraphs (leave a blank line).
- **Tags** are colored labels. The **Tags** page lists every note with that tag across all videos. **Markers** are viewing sessions such as "Original 23" or "Rewatch October 26"; the **Markers** page lists every note from a session across all videos. On a video, when notes use more than one tag or marker, the notes list can be filtered by them.
- **Search** (`/`) looks through every video's notes, titles and descriptions. Filter by video, type, tag, marker and visibility. Filters are kept in the URL, so results can be bookmarked.
- **Pause while typing** is on by default. Opening a note editor pauses the video. Turn it off in **Settings**, or with the checkbox on the note editor.
- **Deleting** a note shows an **Undo** button for a few seconds. The deletion is written to the file immediately, and Undo writes the note back.
- **Fullscreen** (`F`) keeps a quick-notes panel beside the video, or along the bottom when the player is narrow. Press `C` to show or hide that panel, and `N` to add a note without leaving fullscreen. If the notes panel was already open, it stays open behind the editor and comes back when you close the note. The **Notes** button in the controls does the same thing. If the browser blocks fullscreen, theater mode fills the window and keeps that panel.
- **Settings → Data issues** lists anything in the JSON files that couldn't be read. Broken items are kept untouched in the file rather than deleted.

### Links and formatting

These work in note text and in video descriptions.

| Write | Result |
| --- | --- |
| `@0:25` | Links the timestamp note at that time and shows its title. If no note is there, it is a time you can click. |
| `@Summary` | Links a general note by its title. An untitled note can be linked by its first line. |
| `@now` | While the suggestion list is open, inserts the time you started the note from. |
| `#Lecture` | Links another video by title (or by id when two videos share a title). |
| `#Lecture/0:25` | Opens that video at a timestamp. |
| `#Lecture/Summary` | Opens a general note on that video. |
| `$` / `$$` / `$$$` | At the start of a line, makes it bigger. Three dollar signs is the largest. |
| `**text**` | Bold |
| `__text__` | Underlined |
| `~~text~~` | Italic |
| `^^text^^` | Raised, like an exponent |
| `%%text%%` | Lowered and smaller |
| Tab / Shift+Tab | Indent or unindent the current line, or every selected line. Two spaces at the start of a line also indent. |

While writing, type `@` to link a note or insert a time, or `#` to link a video, then pick from the list. Arrow keys move through the list, and Tab or Enter inserts the highlighted match. A finished link or time is highlighted in the box before you save. An `@` or `#` stuck to the middle of a word is left as plain text. While a suggestion list is open, Tab picks a suggestion instead of indenting.

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
| `Esc` | Close the editor, a dialog, or theater mode |

Shortcuts are ignored while typing in a text field. On the video page, these two-character commands still work inside a text field. The two characters are removed when the command runs. A backslash works the same way as the slash.

| Type | Action |
| --- | --- |
| `/t` | Pause or play |
| `/q` | Back 5 seconds |
| `/e` | Forward 5 seconds |
| `/a` | Back 10 seconds |
| `/d` | Forward 10 seconds |

## Data format

All data is plain JSON in `data/`. Files are written with stable key order and 2-space indentation so git diffs stay readable.

`data/library.json` lists which videos exist, in display order:

```json
{ "schemaVersion": 1, "videos": ["nyc23-session-1", "nyc26-session-1"] }
```

`data/videos/<id>.json` holds one video and its notes:

```json
{
  "schemaVersion": 1,
  "id": "nyc23-session-1",
  "title": "NYC23 SESSION 1 OVERFLOW",
  "description": "",
  "visibility": "public",
  "sources": { "local": "videos/NYC23 SESSION 1 OVERFLOW.mp4", "youtube": "C-9uTbpZAiI", "offsetSeconds": 0 },
  "duration": 7855.1,
  "createdAt": "2026-10-08T04:33:42Z",
  "updatedAt": "2026-10-10T05:24:58Z",
  "notes": [
    {
      "id": "n_1ebu0jb12b",
      "type": "timestamp",
      "timestamp": 10,
      "title": "NYC live starts",
      "content": "Mostly just introduces NYC.\n\n**YOU** are made in his image.",
      "tags": ["nyc-live"],
      "markers": ["orignal-23"],
      "visibility": "public",
      "createdAt": "2026-10-09T02:24:39Z",
      "updatedAt": "2026-10-09T02:37:42Z"
    }
  ]
}
```

- `type` is `"timestamp"` (with `timestamp` in seconds) or `"generic"` (with `timestamp: null`).
- `markers` holds at most one marker id. Tags are not limited.
- `visibility` is `"public"` or `"private"`, on both videos and notes.
- `sources.local` and `sources.youtube` are both optional. `youtube` is the 11-character video id; full YouTube URLs pasted into the app are converted automatically.
- `duration` is optional. The player writes it in seconds once it knows the length.
- Note `content` and video `description` are plain text plus the link and formatting marks in the table above. The app renders them; the JSON stores the marks as typed.

`data/descriptors.json` holds the global tags and markers:

```json
{
  "schemaVersion": 1,
  "tags": [{ "id": "verse", "name": "Verse", "color": "#00a2ad", "description": "" }],
  "markers": [{ "id": "rewatch-october-26", "name": "Rewatch October 26", "description": "", "date": "" }]
}
```

Notes refer to tags and markers by `id`, so renaming one updates every note at once. `order` on a marker is optional and controls sort order when it is set.

## Project layout

```
index.html          app shell
css/                tokens (colors, spacing), base, layout, components, player, views
js/config.js        environment rules, editor code, paths, player settings
js/core/            environment detection, store, router, markup, DOM and time helpers
js/data/            schema, validation, visibility filter, repository (all reads and writes)
js/storage/         HTTP loading, File System Access, drafts, downloads, change codes
js/player/          player shell, HTML5 and YouTube adapters, controls, jump history
js/features/        library, video page, notes, tags, markers, search, settings
js/ui/              top bar, modals, help, toasts, banners, icons
data/               library.json, descriptors.json, videos/*.json
videos/             local video files (not committed)
```
