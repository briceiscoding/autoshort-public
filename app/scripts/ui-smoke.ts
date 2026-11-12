// UI smoke test: opens the editor in Remotion's headless Chrome, prints console errors, saves a screenshot.
// Usage: tsx scripts/ui-smoke.ts <url> <screenshot.png> [js to run after load]
import {existsSync, readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import puppeteer from 'puppeteer-core';

const find = (dir: string): string | null => {
	if (!existsSync(dir)) return null;
	for (const e of readdirSync(dir, {withFileTypes: true})) {
		const p = join(dir, e.name);
		if (e.isFile() && e.name === 'chrome-headless-shell.exe') return p;
		if (e.isDirectory()) {
			const f = find(p);
			if (f) return f;
		}
	}
	return null;
};

const [url, shot, scriptArg] = process.argv.slice(2);
const script = scriptArg?.startsWith('@') ? (await import('node:fs')).readFileSync(scriptArg.slice(1), 'utf-8') : scriptArg;
const browser = await puppeteer.launch({executablePath: find(resolve(import.meta.dirname, '../node_modules/.remotion'))!, args: ['--autoplay-policy=no-user-gesture-required'], defaultViewport: {width: 1600, height: 1000}});
const page = await browser.newPage();
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warn') && console.log(`console.${m.type()}:`, m.text()));
page.on('pageerror', (e) => console.log('pageerror:', (e as Error).message));
await page.goto(url, {waitUntil: 'networkidle2', timeout: 60000});
await new Promise((r) => setTimeout(r, 3000));
if (script) console.log('eval:', await page.evaluate(script));
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({path: shot});
await browser.close();
console.log('screenshot ->', shot);
