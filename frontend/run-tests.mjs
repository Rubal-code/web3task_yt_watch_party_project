import { createServer } from 'vite';
import { runVitest } from 'vitest/node';

const config = await import('./vite.config.ts');
const server = await createServer(config.default);
await server.start();

process.exit(0);