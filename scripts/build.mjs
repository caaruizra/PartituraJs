import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const baseConfig = {
  entryPoints: ['src/index.js'],
  bundle: true,
  sourcemap: true,
  target: 'es2019',
  legalComments: 'none'
};

const outputs = [
  {
    ...baseConfig,
    format: 'iife',
    globalName: 'PartituraJS',
    outfile: 'dist/partitura-editor.js',
    footer: {
      js: "if (typeof module !== 'undefined' && module.exports) module.exports = PartituraJS;"
    }
  },
  {
    ...baseConfig,
    format: 'iife',
    globalName: 'PartituraJS',
    outfile: 'dist/partitura-modular.js'
  },
  {
    ...baseConfig,
    format: 'cjs',
    outfile: 'dist/partitura-modular.cjs'
  }
];

async function run() {
  if (watch) {
    const contexts = await Promise.all(outputs.map((cfg) => context(cfg)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('Watching src/ and rebuilding dist/partitura-editor.js + dist/partitura-modular.*');
    return;
  }

  await Promise.all(outputs.map((cfg) => build(cfg)));
  console.log('Built dist/partitura-editor.js, dist/partitura-modular.js and dist/partitura-modular.cjs');
}

try {
  await run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
