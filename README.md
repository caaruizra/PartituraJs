# PartituraJS

PartituraJS is a small, dependency-free JavaScript library for editing a simple score in the browser using SVG.

## Included features

- Staff rendering in SVG.
- Add notes with click.
- Select, move, and delete notes.
- Basic durations from the toolbar.
- Lyric/syllable per note with double-click.
- Note ties (time ligatures) and slurs (expression ligatures).
- Undo/redo.
- Simple playback with Web Audio API.
- Export to JSON and basic MusicXML.
- Import from basic MusicXML (including ties and slurs).
- Framework-free: works with plain HTML, CSS, and JavaScript.

## Internal structure

- `dist/partitura-editor.js`: legacy-compatible runtime (browser global + CommonJS in Node), regenerated from `src/`.
- `src/`: active modular codebase.
  - `src/core`: utilities and constants.
  - `src/music`: music theory (pitch, durations, clef, accidentals).
  - `src/model`: score normalization and model.
  - `src/services`: domain services (`musicxml`, `layout-engine`, `audio-player`).
  - `src/render`: SVG rendering (`score-renderer`, `notes`, `beams`, `svg`).
  - `src/editor`: `ScoreEditor` facade + controllers (`toolbar`, `keyboard`, `pointer`, `context-menu`).
  - `src/MIGRATION_PLAN.md`: phased migration plan.

## Current modular architecture

The current architecture is already separated by responsibilities:

- `ScoreEditor` (in `src/editor/ScoreEditor.js`) acts as a facade/orchestrator.
- Input controllers in `src/editor/` handle keyboard, pointer/marquee, toolbar, and context menu.
- SVG rendering in `src/render/` draws the score, notes/rests, and beaming.
- Services in `src/services/` handle MusicXML export, geometric layout, and audio playback.
- Model and music theory in `src/model/` and `src/music/` contain pure business rules.

## Quick start

```html
<link rel="stylesheet" href="./styles/partitura-editor.css">
<div id="editor"></div>
<script src="./dist/partitura-editor.js"></script>
<script>
  const editor = new PartituraJS.ScoreEditor('#editor', {
    score: {
      title: 'My score',
      composer: 'Me',
      measures: 4,
      timeSignature: { beats: 4, beatType: 4 },
      tempo: 90,
      notes: [
        { measure: 0, beat: 0, duration: 1, pitch: { step: 'C', octave: 4 } }
      ]
    },
    onChange(score) {
      console.log(score);
    }
  });
</script>
```

## Main API

### `new PartituraJS.ScoreEditor(container, options)`

`container` can be a CSS selector or a DOM element.

Useful options:

- `score`: score JSON object.
- `measures`: number of measures if `score` is not provided.
- `timeSignature`: for example `{ beats: 4, beatType: 4 }`.
- `noteDuration`: initial duration when adding notes, in beats.
- `mode`: `'write'` or `'select'`.
- `readonly`: disables editing.
- `showToolbar`: shows or hides the toolbar.
- `language`: `'es'` or `'en'`; defaults to Spanish.
- `onChange(score, meta)`: callback on changes.
- `onSelect(notes)`: callback on selection.

### Methods

- `editor.addNote(note)`
- `editor.removeSelected()`
- `editor.setScore(score)`
- `editor.setLanguage('es' | 'en')`
- `editor.toJSON()`
- `editor.exportMusicXML()`
- `editor.importMusicXML(xmlString)`
- `editor.undo()`
- `editor.redo()`
- `editor.play()`
- `editor.setMode('write' | 'select')`

`importMusicXML` is also exported at module level to parse XML without creating an editor instance.

## JSON model

```json
{
  "title": "My score",
  "composer": "Me",
  "clef": "treble",
  "tempo": 90,
  "measures": 4,
  "timeSignature": { "beats": 4, "beatType": 4 },
  "notes": [
    {
      "id": "n_abc123",
      "measure": 0,
      "beat": 0,
      "duration": 1,
      "pitch": { "step": "C", "octave": 4, "alter": 0 },
      "lyric": "",
      "tieStart": false,
      "tieStop": false,
      "slurStart": false,
      "slurStop": false
    }
  ]
}
```

`measure` starts at 0. `beat` also starts at 0 inside each measure. `duration` is expressed in beats: `1` equals a quarter note in 4/4.

## Limitations of this version

This version is an editable foundation, not a complete music notation engine. It does not yet include automatic rests, visual key signatures, multiple voices, advanced beaming, complex compound meters, or full MusicXML coverage.

## Run the demo

Open `demo.html` directly in the browser or serve it with a local server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/demo.html`.

## Build dist from src

Install dependencies and generate bundles:

```bash
npm install
npm run build
```

This generates:

- `dist/partitura-editor.js` (legacy-compatible bundle)
- `dist/partitura-modular.js` (IIFE for browser)
- `dist/partitura-modular.cjs` (CommonJS)

To rebuild in watch mode:

```bash
npm run build:watch
```

To automatically verify compatibility and key regressions:

```bash
npm run verify
```

`verify` runs build and validates:

- expected CommonJS exports
- MusicXML with `<dot/>` and `<rest/>`
- presence of global API in the IIFE bundle
- note/rest toggle logic via `R` key

The internal `ScoreEditor` split by responsibilities (renderer/controllers/layout/audio) is tracked in `src/MIGRATION_PLAN.md`.

## AI usage

This project was built with support from COPILOT.

## Author

Carlos Alejandro Ruiz Ramirez

## License

MIT.
