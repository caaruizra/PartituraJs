# PartituraJS Modularization

This document describes the migration from `dist/partitura-editor.js` (monolithic) to a modular structure in `src/`.

## Current status

Pure modules were extracted:

- `src/core/constants.js`
- `src/core/utils.js`
- `src/music/clef.js`
- `src/music/pitch.js`
- `src/music/duration.js`
- `src/music/accidental.js`
- `src/model/normalizeScore.js`
- `src/model/ScoreModel.js`
- `src/services/musicxml.js`
- `src/index.js`

With this, business rules and export logic are no longer DOM-dependent.

A bridge step was also completed:

- `src/editor/ScoreEditor.js` contains the `ScoreEditor` class extracted from the legacy runtime.
- `scripts/build.mjs` now regenerates `dist/partitura-editor.js` from `src/`.
- The legacy bundle keeps public compatibility:
	- Global API: `window.PartituraJS`
	- CommonJS: `module.exports`

The main responsibility decoupling is complete:

- `src/services/layout-engine.js` with `buildMeasureLayout`, `buildBeamLayout`, `beatToX`, and `noteToX`.
- `src/services/audio-player.js` with `play`, `playNote`, `stopPlayback`, `tickPlayback`, `getPlaybackPosition`, `updatePlaybackCursor`, and `removePlaybackCursor`.
- `src/render/score-renderer.js`, `src/render/notes.js`, `src/render/beams.js`, and `src/render/svg.js`.
- `src/editor/toolbar-controller.js`, `src/editor/keyboard-controller.js`, `src/editor/pointer-controller.js`, `src/editor/context-menu-controller.js`.
- `ScoreEditor` delegates toolbar, keyboard, pointer/marquee, context menu, renderer, layout, and audio.

At this stage, `ScoreEditor` works as a facade/orchestrator, not as a monolithic god class.

Automated verification was also added:

- `npm run verify` (`scripts/verify.mjs`) runs build and validates:
	- expected CommonJS exports
	- MusicXML with `<dot/>` and `<rest/>`
	- presence of global API in the IIFE bundle
	- note/rest toggle logic (`R` key)

## Recommended phase 2

Extract `ScoreEditor` by responsibility:

1. `src/editor/toolbar-controller.js`
- `renderToolbar`, `renderMeasureToolbar`, `updateToolbar`, `updateMeasureToolbar`.

Current status: extracted and `ScoreEditor` delegates toolbar logic to this controller.

2. `src/editor/keyboard-controller.js`
- `bindKeyboard`, `handleKeyboardNavigation`, `transposeSelectedNotes`, `convertSelectedNoteToRest`.

Current status: extracted and `ScoreEditor` delegates these methods to this controller.

3. `src/editor/pointer-controller.js`
- mouse/touch and marquee handlers.

Current status: extracted (`onCanvasPointerDown`, `onCanvasDrop`, `onNotePointerDown`, `onPointerMove`, `onPointerUp`, context menu, and marquee) and `ScoreEditor` delegates to this controller.

Additional:

- `src/editor/context-menu-controller.js` encapsulates rendering and actions for the context menu (measures and notes).
- `ScoreEditor` delegates `renderContextMenu`, `showContextMenu`, `showNoteContextMenu`, and `hideContextMenu`.

4. `src/render/score-renderer.js`
- `drawScore`, `drawNote`, `drawRest`, `drawBeams`.

Current status: renderer migrated to separate modules (`src/render/score-renderer.js`, `src/render/notes.js`, `src/render/beams.js`, and `src/render/svg.js`).

5. `src/services/layout-engine.js`
- `buildMeasureLayout`, `buildBeamLayout`, `beatToX`, `noteToX`.

6. `src/services/audio-player.js`
- `play`, `playNote`, `stopPlayback`, `tickPlayback`.

Current status: extracted into `src/services/audio-player.js`, including playback cursor (`getPlaybackPosition`, `updatePlaybackCursor`, `removePlaybackCursor`), and `ScoreEditor` already delegates these responsibilities.

Overall phase 2 status: completed.

## Recommended phase 3

Further deepen internal `ScoreEditor` separation and consolidate public outputs:

- keep `dist/partitura-editor.js` as the main compatible output
- decide whether `dist/partitura-modular.*` remains a secondary output or is simplified

Current automated minimum test status:

	- completed via `npm run verify` for:
	- MusicXML export with dotted notes and rests
	- note/rest toggle (toolbar and `R` key)
	- API compatibility (`require` and global)

Suggested remaining phase 3 tasks:

- decide final distribution strategy (`partitura-editor.js` only vs also `partitura-modular.*`)
- add UI integration tests (selection/marquee, note drag, context menu) to cover full interaction
- stabilize public export conventions in `src/index.js` and document official API surface

In the meantime, the legacy runtime is still generated from `src/` with preserved public compatibility.
