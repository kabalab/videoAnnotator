---
name: Clips and shorter codes
overview: Add a Clips section for titled, tagged time ranges and named collections that play in order, stop timestamp notes from gaining new markers, and make change codes store only what changed.
todos:
  - id: clips-data
    content: Add data/clips.json plus schema, validation, store, and repository load/save
    status: pending
  - id: clips-ui
    content: Add Clips nav, page, editors, and ranged playback for clips and collections
    status: pending
  - id: timestamp-markers
    content: Hide marker picking on timestamp notes and keep existing marker ids
    status: pending
  - id: change-codes
    content: Export VA2 delta change codes, still import VA1, and review clips in Settings
    status: pending
isProject: false
---

# Clips, collections, and shorter change codes

## Clips and collections

Store both in a new [`data/clips.json`](data/clips.json), loaded and saved the same way as [`data/descriptors.json`](data/descriptors.json) (validate, draft overlay, folder save). A clip points at a library video; a collection is an ordered list of clip ids, so one sequence can cross videos.

```json
{
  "schemaVersion": 1,
  "clips": [
    {
      "id": "c_…",
      "videoId": "nyc26-session-7",
      "start": 90,
      "end": 210,
      "title": "Opening",
      "description": "",
      "tags": ["song"]
    }
  ],
  "collections": [
    {
      "id": "k_…",
      "title": "Highlights",
      "description": "",
      "clipIds": ["c_…"]
    }
  ]
}
```

Times use the existing clock parser (`1:30`, `1:02:03`). End must be after start. Clips get tags only, through the current tag picker. No marker field. A clip whose source video is hidden (private, or no YouTube link on the public site) is hidden with it.

New top-bar item **Clips**, routes `#/clips`, `#/clip/<id>`, and `#/collection/<id>`, all one page:

- Left: clip list and collection list. Edit mode can add, edit, and delete either.
- Clip form: title, description, source video, start, end, tags.
- Collection form: title, description, and an ordered clip list (add, remove, move up/down).
- Main area: the existing player from [`js/player/playerShell.js`](js/player/playerShell.js).

Playback: opening a clip seeks to `start` and pauses when time reaches `end`. Opening a collection does the same, then loads the next clip (switching source video when needed) until the list ends. Clicking a clip inside a collection starts there and continues forward. Seeking stays inside the current clip’s range.

## Timestamp notes

In [`js/features/notes/noteEditor.js`](js/features/notes/noteEditor.js), hide the marker picker whenever the note type is Timestamp. New timestamp notes save with no markers. Editing an existing timestamp note keeps whatever markers it already has, so old data is not wiped, but nothing new can be added. General notes still take one marker. Help text that says every note can take a marker will say general notes only.

## Shorter change codes

[`js/storage/changeCode.js`](js/storage/changeCode.js) currently base64-encodes the full text of every dirty file (`VA1.`). Export will compare each draft to the project file from `readProjectText` and write a `VA2.` code that keeps only the difference:

- Video file: changed top-level fields, notes that were added or edited (whole note objects), deleted note ids, and the note id order only if that order changed.
- Descriptors: added, edited, or deleted tags and markers.
- Library: the new video id list only when it changed.
- Clips file: the same id-based merge for clips and collections.
- A brand-new file still includes its full text. A deletion stays a delete flag.

Import still accepts old `VA1.` codes. A `VA2.` code is applied onto the current project file, then the merged full text is stored as the draft (drafts themselves stay full files so the rest of saving is unchanged). A changed note replaces that note by id; every other note is left as it is. Reordering uses the id list in the code.

Settings draft review will recognize `data/clips.json` and summarize clip and collection adds, edits, and removals the same way it already summarizes notes.
