import { build } from 'esbuild';
import { resolve } from 'path';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  nodePaths: [resolve('../../node_modules/.pnpm/node_modules')],
  external: [
    'express',
    'cors',
    'cookie-parser',
    'jsonwebtoken',
    'bcryptjs',
    'dotenv',
    'zod',
    '@anthropic-ai/sdk',
    '@opencode-ai/sdk',
    'openai',
  ],
  banner: {
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
});

console.log('✓ Sidecar built successfully');
