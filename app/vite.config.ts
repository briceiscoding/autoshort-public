import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

const root = resolve(import.meta.dirname, '..');
const config = {
	...JSON.parse(readFileSync(resolve(root, 'config.json'), 'utf-8')),
	...(existsSync(resolve(root, 'config.local.json')) ? JSON.parse(readFileSync(resolve(root, 'config.local.json'), 'utf-8')) : {}),
};
const backend = `http://127.0.0.1:${config.backendPort}`;
const kit = resolve(import.meta.dirname, 'src/composition/kit');
const projects = resolve(root, config.projectsRoot);

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			// Kit for hand-written diagrams (projects/<slug>/diagrams/*.tsx, escape hatch).
			'@kit/schema': resolve(kit, 'schema.tsx'),
			'@kit/types': resolve(kit, 'types.ts'),
			'@kit/theme': resolve(kit, 'theme.ts'),
		},
		dedupe: ['react', 'react-dom', 'remotion', 'roughjs', 'path-data-parser'],
	},
	server: {
		host: '127.0.0.1',
		port: config.frontendPort,
		strictPort: true,
		fs: {allow: [root, projects]},
		proxy: {'/api': backend, '/media': backend, '/library': backend},
	},
});
