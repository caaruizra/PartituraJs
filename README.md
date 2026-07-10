# PartituraJS

PartituraJS es una librería JavaScript pequeña y sin dependencias para editar una partitura simple en el navegador usando SVG.

## Funciones incluidas

- Render de pentagrama en SVG.
- Agregar notas con clic.
- Seleccionar, mover y borrar notas.
- Duraciones básicas: corchea, negra y blanca desde la barra de herramientas.
- Letra/sílaba por nota con doble clic.
- Undo/redo.
- Reproducción simple con Web Audio API.
- Exportación a JSON y MusicXML básico.
- Sin framework: funciona con HTML, CSS y JavaScript plano.

## Uso rápido

```html
<link rel="stylesheet" href="./styles/partitura-editor.css">
<div id="editor"></div>
<script src="./dist/partitura-editor.js"></script>
<script>
  const editor = new PartituraJS.ScoreEditor('#editor', {
    score: {
      title: 'Mi partitura',
      composer: 'Yo',
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

## API principal

### `new PartituraJS.ScoreEditor(container, options)`

`container` puede ser un selector CSS o un elemento DOM.

Opciones útiles:

- `score`: objeto JSON de la partitura.
- `measures`: cantidad de compases si no se entrega `score`.
- `timeSignature`: por ejemplo `{ beats: 4, beatType: 4 }`.
- `noteDuration`: duración inicial al agregar notas, en pulsos.
- `mode`: `'write'` o `'select'`.
- `readonly`: desactiva edición.
- `showToolbar`: muestra u oculta la barra de herramientas.
- `onChange(score, meta)`: callback al cambiar.
- `onSelect(notes)`: callback al seleccionar.

### Métodos

- `editor.addNote(note)`
- `editor.removeSelected()`
- `editor.setScore(score)`
- `editor.toJSON()`
- `editor.exportMusicXML()`
- `editor.undo()`
- `editor.redo()`
- `editor.play()`
- `editor.setMode('write' | 'select')`

## Modelo JSON

```json
{
  "title": "Mi partitura",
  "composer": "Yo",
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
      "lyric": ""
    }
  ]
}
```

`measure` empieza en 0. `beat` también empieza en 0 dentro del compás. `duration` se expresa en pulsos: `1` equivale a una negra en 4/4.

## Limitaciones de esta versión

Esta versión es una base editable, no un motor completo de notación musical. Aún no incluye ligaduras, silencios automáticos, armaduras visuales, múltiples voces, beams avanzados, compases compuestos complejos ni importación MusicXML completa.

## Ejecutar la demo

Abre `demo.html` directamente en el navegador o sírvelo con un servidor local:

```bash
python3 -m http.server 8080
```

Luego visita `http://localhost:8080/demo.html`.

## Uso de IA

Este proyecto se ha construido apoyado en el uso de COPILOT.

## Creador

Carlos Alejandro Ruiz Ramirez

## Licencia

MIT.
