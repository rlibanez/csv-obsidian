import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import * as sass from 'sass';
import { fileURLToPath } from 'node:url';

const development = process.env.ROLLUP_WATCH === 'true';

function styles() {
  return {
    name: 'csv-styles',
    transform(source, id) {
      if (!id.endsWith('.scss')) return null;
      const result = sass.compile(id, { style: 'expanded' });
      for (const url of result.loadedUrls) {
        if (url.protocol === 'file:') this.addWatchFile(fileURLToPath(url));
      }
      this.emitFile({ type: 'asset', fileName: 'styles.css', source: result.css });
      return { code: '', map: { mappings: '' } };
    },
  };
}

export default {
  input: 'src/main.ts',
  output: {
    dir: '.',
    sourcemap: development ? 'inline' : false,
    format: 'cjs',
    exports: 'default',
  },
  external: ['obsidian'],
  plugins: [
    typescript({ sourceMap: development, inlineSources: development }),
    nodeResolve({ browser: true }),
    commonjs(),
    styles(),
  ],
};
