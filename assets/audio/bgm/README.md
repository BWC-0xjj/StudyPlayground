# Background music

Put licensed background music files in this folder.

Recommended formats:

- `.mp3` for best browser compatibility.
- `.ogg` as a good open alternative.

After adding files, list them in `manifest.js`:

```js
window.BGM_TRACKS = [
  "./assets/audio/bgm/example.mp3"
];
```

The app will randomly choose a track, play it, then randomly choose another track when the song ends.

For private local-only testing, create `local-tracks.json` in this folder:

```json
[
  "./assets/audio/bgm/local-song.mp3"
]
```

`local-tracks.json` and local audio files are ignored by Git.
