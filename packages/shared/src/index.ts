import { z } from "zod";

export const ClinicalExtractionSchema = z.object({
  chief_complaint: z.string(),
  vitals: z.object({
    bp: z.string().nullable().optional(),
    hr: z.number().nullable().optional(),
    temp_f: z.number().nullable().optional(),
    spo2: z.number().nullable().optional(),
  }),
  medications: z.array(
    z.object({
      name: z.string(),
      dose: z.string(),
      frequency: z.string(),
      route: z.string(),
    })
  ).optional().default([]),
  diagnoses: z.array(
    z.object({
      description: z.string(),
      icd10: z.string().nullable().optional(),
    })
  ).optional().default([]),
  plan: z.array(z.string()).optional().default([]),
  follow_up: z.object({
    interval_days: z.number().int().nullable().optional(),
    reason: z.string().nullable().optional(),
  }),
});

export type ClinicalExtraction = z.infer<typeof ClinicalExtractionSchema>;

export type StrategyType = "zero_shot" | "few_shot" | "cot";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ExtractionResult {
  data: ClinicalExtraction | null;
  success: boolean;
  attempts: number;
  usage: TokenUsage;
  error?: string;
  trace: any[];
}