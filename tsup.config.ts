import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/server.ts',
    'src/config/**/*.ts',
    'src/models/**/*.ts',
    'src/routes/**/*.ts',
    'src/services/**/*.ts',
    'src/tools/**/*.ts',
    'src/types/**/*.ts',
    'src/utils/**/*.ts',
  ],
  format: ['cjs'],
  target: 'node18',
  outDir: 'dist',
  bundle: false,
  clean: true,
  sourcemap: true,
});
