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

Y un paso de desacople adicional:

- Se extrajo `src/services/layout-engine.js` con `buildMeasureLayout`, `buildBeamLayout`, `beatToX` y `noteToX`.
- `ScoreEditor` ahora delega ese calculo al modulo de layout en lugar de contener toda la logica geométrica.

Y un avance inicial de renderer:

- Se extrajo `src/render/beams.js` con el render de barras y flags de grupos beameados.
- Se extrajo `src/render/notes.js` con `drawNote` y `drawRest`.
- Se extrajo `src/render/score-renderer.js` con `drawScore`.
- Se extrajo `src/render/svg.js` con `createSvg` compartido.
- `ScoreEditor.drawBeams()` ahora delega al modulo de renderer.
- `ScoreEditor.drawNote()`, `ScoreEditor.drawRest()` y `ScoreEditor.drawScore()` ahora delegan al renderer.

## Fase 2 recomendada

Extraer `ScoreEditor` por responsabilidades:

1. `src/editor/toolbar-controller.js`
- `renderToolbar`, `renderMeasureToolbar`, `updateToolbar`, `updateMeasureToolbar`.

Estado actual: extraido y `ScoreEditor` delega la logica de toolbar al controller.

2. `src/editor/keyboard-controller.js`
- `bindKeyboard`, `handleKeyboardNavigation`, `transposeSelectedNotes`, `convertSelectedNoteToRest`.

Estado actual: extraido y `ScoreEditor` delega estos metodos al controller.

3. `src/editor/pointer-controller.js`
- handlers de mouse/touch y marquee.

Estado actual: extraido (`onCanvasPointerDown`, `onCanvasDrop`, `onNotePointerDown`, `onPointerMove`, `onPointerUp`, context menu y marquee) y `ScoreEditor` delega al controller.

Adicional:

- `src/editor/context-menu-controller.js` encapsula render y acciones del menu contextual (compases y notas).
- `ScoreEditor` delega `renderContextMenu`, `showContextMenu`, `showNoteContextMenu` y `hideContextMenu`.

4. `src/render/score-renderer.js`
- `drawScore`, `drawNote`, `drawRest`, `drawBeams`.

Estado actual: renderer migrado a modulos separados (`src/render/score-renderer.js`, `src/render/notes.js`, `src/render/beams.js` y `src/render/svg.js`).

5. `src/services/layout-engine.js`
- `buildMeasureLayout`, `buildBeamLayout`, `beatToX`, `noteToX`.

6. `src/services/audio-player.js`
- `play`, `playNote`, `stopPlayback`, `tickPlayback`.

Estado actual: extraido en `src/services/audio-player.js`, incluyendo cursor de reproduccion (`getPlaybackPosition`, `updatePlaybackCursor`, `removePlaybackCursor`), y `ScoreEditor` ya delega estas responsabilidades.

## Fase 3 recomendada

Profundizar la separacion interna de `ScoreEditor` y consolidar la salida publica:

- mantener `dist/partitura-editor.js` como salida principal compatible
- decidir si `dist/partitura-modular.*` se mantiene como salida secundaria o se simplifica
- agregar pruebas automatizadas minimas para validar:
	- export MusicXML con puntillos y silencios
	- toggle nota/silencio (toolbar y tecla `R`)
	- compatibilidad de API (`require` y global)

Estado actual: agregado `npm run verify` (`scripts/verify.mjs`) que valida estos tres puntos sobre los bundles de `dist/`.

Mientras tanto, `src/editor/ScoreEditor.js` funciona como modulo puente (aun monolitico internamente).
