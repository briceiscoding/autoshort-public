// Analysis data computed by the import job (projects/<slug>/data/analysis.json). Read only for the UI and the linter.
import {z} from 'zod';

export const AnalysisSchema = z
	.object({
		schemaVersion: z.literal(1),
		// Face bounding boxes sampled over the rush, in SOURCE pixels: [x, y, w, h], null when no face.
		face: z
			.object({
				interval: z.number().positive(),
				samples: z.array(z.object({t: z.number(), box: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable()})),
			})
			.nullable()
			.optional(),
		// Speech regions from Silero VAD, rush time.
		vad: z.array(z.object({start: z.number(), end: z.number()})).optional(),
		// Speech regions from the energy burst detector (fallback), rush time.
		bursts: z.array(z.object({start: z.number(), end: z.number()})).optional(),
		transcription: z
			.object({model: z.string(), computeType: z.string().optional(), batchSize: z.number().optional()})
			.optional(),
		// Loudness of the last exports, measured after mixing.
		exports: z
			.array(
				z.object({
					file: z.string(),
					at: z.string(),
					integratedLufs: z.number(),
					truePeakDb: z.number(),
					voiceLufs: z.number().optional(),
				}),
			)
			.optional(),
	})
	.passthrough();

export type Analysis = z.infer<typeof AnalysisSchema>;

export type FaceBox = [number, number, number, number];

// Face box at a rush time (nearest sample), converted to canvas pixels through the crop.
export const faceAt = (
	analysis: Analysis | null | undefined,
	t: number,
	crop: {x: number; y: number; height: number},
	canvasHeight: number,
): FaceBox | null => {
	const samples = analysis?.face?.samples;
	if (!samples?.length) return null;
	let best = samples[0];
	for (const s of samples) if (Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
	if (!best.box || Math.abs(best.t - t) > (analysis!.face!.interval ?? 0.5) * 2) return null;
	const k = canvasHeight / crop.height;
	const [x, y, w, h] = best.box;
	return [(x - crop.x) * k, (y - crop.y) * k, w * k, h * k];
};
