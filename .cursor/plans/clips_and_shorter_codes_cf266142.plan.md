---
name: Clips and shorter codes
overview: Add a Clips section for titled, tagged time ranges and named collections that play in order, with a range editor that shows timestamp notes, # links to clips and collections in prose fields, no new markers on timestamp notes, and change codes that store only what changed.
todos:
  - id: clips-data
    content: Add data/clips.json plus schema, validation, store, and repository load/save
    status: pending
  - id: clips-ui
    content: Add Clips nav, page, range editor with timestamp ticks, and ranged playback for clips and collections
    status: pending
  - id: clip-mentions
    content: Let prose fields link a clip, a collection, or a clip inside a collection with #
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

- Left: clip list and collection list. Adding, editing, and deleting follow `canEdit()`, same as notes.
- Clip form: title (required), description, source video, start, end, tags.
- Collection form: title (required), description, and an ordered clip list (add, remove, move up/down). The same clip may appear more than once. A collection holds clip ids only, never another collection.
- Main area: the existing player from [`js/player/playerShell.js`](js/player/playerShell.js). Timestamp and Note buttons stay hidden on this page. Notes are still edited on the video page.
- `#/clips` with nothing open shows the lists and a player prompt to pick a clip or collection.

### Setting the range

Editing a clip loads the whole source video. The seek bar is the full duration, and that video’s timestamp notes are the same seek-bar ticks as on the video page (time and title on hover). A list beside the form shows those timestamp notes only, each as time plus title. Clicking a row or a tick seeks there. General notes are left out of the list because they have no time.

The clip is a highlighted band on that bar, with a start handle and an end handle. Dragging a handle updates the start or end field, and typing in a field moves the handle. Both fields use the existing clock parser. **Set start** and **Set end** copy the playhead into that field. **Play clip** seeks to start and pauses at end, so the range can be checked before saving. While the form is open, seeking is not limited to the band.

A new clip opened from a video (Edit mode, **Clip** on the player) goes to `#/clip/new` with that video and the current time already in start. End stays empty until it is set. Save stays disabled until a video is chosen and end is after start.

### Watching

Opening a saved clip seeks to `start` and pauses at `end`. The seek bar for that viewing is only the clip: the left edge is `start`, the right edge is `end`, and scrubbing, arrows, and J/L stay inside it. Timestamp ticks that fall inside the clip stay on this shorter bar.

Opening a collection plays the first clip the same way, then starts the next clip immediately (no pause between clips), switching source video when needed, until the last clip pauses at its end. Clicking a clip inside a collection starts there and continues forward. A clip the viewer cannot see, or whose video is missing, is skipped. In the editor it still appears in the list, marked missing, and can be removed.

Deleting a clip removes its id from every collection. A collection that ends up with no clips is kept.

## Linking clips and collections

`#` already links a video (`#Lecture`), a note on it (`#Lecture/Summary`), or a time on it (`#Lecture/0:25`). Clips and collections use that same mark, in every prose field that already links `#` (note body, video description) and in clip and collection titles and descriptions. The mention menu and the clickable text both learn the new targets. Note titles and video titles get the menu too, and a `#` there becomes a clickable link the same way the body already does.

Typing `#` lists videos, clips, and collections together. Each row is labeled Video, Clip, or Collection. After a collection name and `/`, the list is only the clips in that collection.

Written form, same title rules videos already use (unique plain title, otherwise the id; `#t#` shows the title only):

- `#Opening` opens `#/clip/<id>` and plays that range.
- `#Highlights` opens `#/collection/<id>` and plays from the first clip.
- `#Highlights/Opening` opens that collection at that clip and continues forward. The clip must be in that collection. A name that is not in the collection stays typed text and does not fall through to a video note. The part after `/` is a clip title or id, never a clock time.

When a clip, collection, and video share a title, the token is written as the id, and the menu hint shows the kind plus the id. `#Name/…` is a collection only when that name is a unique collection. If the same name is also a video, the collection id is required before the slash, so `#Lecture/Summary` still means a note on the video.

A clip or collection the viewer cannot see does not become a link. Search does not index clips or collections. The Tags page lists clips that use a tag, each row the clip title and its source video, using the same tag list notes already use.

Help text that explains `#Lecture` also mentions `#Opening`, `#Highlights`, and `#Highlights/Opening`.

## Timestamp notes

In [`js/features/notes/noteEditor.js`](js/features/notes/noteEditor.js), hide the marker picker whenever the note type is Timestamp. New timestamp notes save with no markers. Editing an existing timestamp note keeps whatever markers it already has, so old data is not wiped, but nothing new can be added. General notes still take one marker. Help text that says every note can take a marker will say general notes only.

## Shorter change codes

[`js/storage/changeCode.js`](js/storage/changeCode.js) currently base64-encodes the full text of every dirty file (`VA1.`). Export will compare each draft to the project file from `readProjectText` and write a `VA2.` code that keeps only the difference:

- Video file: changed top-level fields, notes that were added or edited (whole note objects), deleted note ids, and the note id order only if that order changed.
- Descriptors: added, edited, or deleted tags and markers.
- Library: the new video id list only when it changed.
- Clips file: added or edited clip and collection objects by id, deleted ids, and a collection’s `clipIds` list only when that order or membership changed.
- A brand-new file still includes its full text. A deletion stays a delete flag.

Import still accepts old `VA1.` codes. A `VA2.` code is applied onto the current project file, then the merged full text is stored as the draft (drafts themselves stay full files so the rest of saving is unchanged). A changed note replaces that note by id; every other note is left as it is. Reordering uses the id list in the code.

Settings draft review will recognize `data/clips.json` and summarize clip and collection adds, edits, and removals the same way it already summarizes notes.
