// Writes the JSON Schema contract (/schema) from the zod schemas.
import {writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {z} from 'zod';
import {PlanSchema, SCHEMA_VERSION} from '../src/model/plan';
import {ThemeSchema} from '../src/model/theme';

const out = resolve(import.meta.dirname, '../../schema');
mkdirSync(out, {recursive: true});
const write = (name: string, schema: z.ZodType, title: string) => {
	const json = {
		...z.toJSONSchema(schema, {io: 'input', target: 'draft-2020-12'}),
		$id: `https://autoshort.local/schema/${name}`,
		title,
		'x-schemaVersion': SCHEMA_VERSION,
	};
	writeFileSync(resolve(out, name), JSON.stringify(json, null, 2) + '\n');
	console.log('wrote', name);
};
write('plan.schema.json', PlanSchema, 'AutoShort plan (rush time)');
write('theme.schema.json', ThemeSchema, 'AutoShort theme');
