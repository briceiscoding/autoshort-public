// Derive edl.json from a plan with the same TS code as the preview.
// Usage: tsx scripts/edl-cli.ts <plan.json> <theme.json> <out edl.json>
import {readFileSync, writeFileSync} from 'node:fs';
import {buildEdl} from '../src/edl/buildEdl';
import {parsePlan} from '../src/model/plan';
import {ThemeSchema, resolveTheme} from '../src/model/theme';
import {lintPlan} from '../src/lint/lint';

const [planFile, themeFile, out] = process.argv.slice(2);
if (!out) {
	console.error('usage: edl-cli <plan.json> <theme.json> <out.json>');
	process.exit(2);
}
const plan = parsePlan(JSON.parse(readFileSync(planFile, 'utf-8')));
const theme = resolveTheme(ThemeSchema.parse(JSON.parse(readFileSync(themeFile, 'utf-8'))), plan.themeOverrides);
const edl = buildEdl(plan, theme);
writeFileSync(out, JSON.stringify(edl, null, 1));
const warnings = lintPlan(plan, theme, null);
console.log(`EDL: ${edl.durationAfter.toFixed(2)} s, ${edl.segments.length} segments, ${edl.captions.length} caption blocks, ${edl.sfx.length} sfx`);
for (const w of warnings) console.log(`lint ${w.severity}: ${w.message}`);
