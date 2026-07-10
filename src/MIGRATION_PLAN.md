# Modularizacion de PartituraJS

Este documento describe la migracion desde `dist/partitura-editor.js` (monolitico) hacia una estructura modular en `src/`.

## Estado actual

Se extrajeron modulos puros:

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

Con esto, reglas de negocio y exportacion dejan de depender del DOM.

Tambien se completo un paso puente:

- `src/editor/ScoreEditor.js` contiene la clase `ScoreEditor` extraida del runtime legacy.
- `scripts/build.mjs` ya regenera `dist/partitura-editor.js` desde `src/`.
- El bundle legacy mantiene compatibilidad publica:
	- API global: `window.PartituraJS`
	- CommonJS: `module.exports`

## Fase 2 recomendada

Extraer `ScoreEditor` por responsabilidades:

1. `src/editor/toolbar-controller.js`
- `renderToolbar`, `renderMeasureToolbar`, `updateToolbar`, `updateMeasureToolbar`.

2. `src/editor/keyboard-controller.js`
- `bindKeyboard`, `handleKeyboardNavigation`, `transposeSelectedNotes`, `convertSelectedNoteToRest`.

3. `src/editor/pointer-controller.js`
- handlers de mouse/touch y marquee.

4. `src/render/score-renderer.js`
- `drawScore`, `drawNote`, `drawRest`, `drawBeams`.

5. `src/services/layout-engine.js`
- `buildMeasureLayout`, `buildBeamLayout`, `beatToX`, `noteToX`.

6. `src/services/audio-player.js`
- `play`, `playNote`, `stopPlayback`, `tickPlayback`.

## Fase 3 recomendada

Profundizar la separacion interna de `ScoreEditor` y consolidar la salida publica:

- mantener `dist/partitura-editor.js` como salida principal compatible
- decidir si `dist/partitura-modular.*` se mantiene como salida secundaria o se simplifica
- agregar pruebas automatizadas minimas para validar:
	- export MusicXML con puntillos y silencios
	- toggle nota/silencio (toolbar y tecla `R`)
	- compatibilidad de API (`require` y global)

Mientras tanto, `src/editor/ScoreEditor.js` funciona como modulo puente (aun monolitico internamente).
