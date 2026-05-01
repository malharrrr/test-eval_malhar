import Anthropic from "@anthropic-ai/sdk";
import { ClinicalExtractionSchema } from "@healos/shared";
import type { StrategyType, ExtractionResult } from "@healos/shared";


const extractTool: Anthropic.Tool = {
  name: "extract_clinical_data",
  description: "Extract structured clinical data from the transcript. You must use this tool to output the data.",
  input_schema: {
    type: "object",
    properties: {
      chief_complaint: { type: "string" },
      vitals: {
        type: "object",
        properties: {
          bp: { type: ["string", "null"] },
          hr: { type: ["number", "null"] },
          temp_f: { type: ["number", "null"] },
          spo2: { type: ["number", "null"] },
        },
        required: ["bp", "hr", "temp_f", "spo2"],
      },
      medications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            dose: { type: "string" },
            frequency: { type: "string" },
            route: { type: "string" },
          },
          required: ["name", "dose", "frequency", "route"],
        },
      },
      diagnoses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            icd10: { type: ["string", "null"] },
          },
          required: ["description"],
        },
      },
      plan: { type: "array", items: { type: "string" } },
      follow_up: {
        type: "object",
        properties: {
          interval_days: { type: ["integer", "null"] },
          reason: { type: ["string", "null"] },
        },
        required: ["interval_days", "reason"],
      },
    },
    required: ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"],
  },
};

const getSystemPrompt = (strategy: StrategyType): string => {
  const base = "You are an expert medical coder and scribe. Extract the structured clinical data from the following patient-doctor transcript using the provided tool.";
  
  switch (strategy) {
    case "zero_shot":
      return base;
    case "few_shot":
      return `${base}\n\nExample:\nTranscript: "Patient complains of headache. Temp is 99.1. Take Tylenol 500mg PO PRN. Follow up in 1 week."\nOutput: { "chief_complaint": "headache", "vitals": { "bp": null, "hr": null, "temp_f": 99.1, "spo2": null }, "medications": [{ "name": "Tylenol", "dose": "500mg", "frequency": "PRN", "route": "PO" }], "diagnoses": [], "plan": ["Take Tylenol as needed"], "follow_up": { "interval_days": 7, "reason": null } }`;
    case "cot":
      return `${base}\n\nBefore calling the tool, think step-by-step in <thinking> tags. 1. Identify the chief complaint. 2. Scan for vitals. 3. List medications with dose/freq/route. 4. List diagnoses. 5. Summarize the plan. 6. Determine follow-up. Then call the tool.`;
    default:
      return base;
  }
};

export const extractTranscript = async (
  transcript: string,
  strategy: StrategyType,
  model: string
): Promise<ExtractionResult> => {
  const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

  const maxAttempts = 3;
  let attempts = 0;
  // track tokens across retries for accurate costing
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheCreate = 0;
  let totalCacheRead = 0;
  
  const trace: any[] = [];
  
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: transcript }
  ];

  const system = [
    {
      type: "text" as const,
      text: getSystemPrompt(strategy),
      cache_control: { type: "ephemeral" as const } 
    }
  ];

  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 2000,
        system: system,
        messages: messages,
        tools: [extractTool],
        tool_choice: { type: "tool", name: "extract_clinical_data" },
      });

      totalInput += response.usage.input_tokens || 0;
      totalOutput += response.usage.output_tokens || 0;
      totalCacheCreate += (response.usage as any).cache_creation_input_tokens || 0;
      totalCacheRead += (response.usage as any).cache_read_input_tokens || 0;
      
      trace.push({ attempt: attempts, response });

      const toolUse = response.content.find((block) => block.type === "tool_use");
      
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model failed to invoke the extraction tool.");
      }
      // validating against zod schema
      const parsed = ClinicalExtractionSchema.safeParse(toolUse.input);

      if (parsed.success) {
        return {
          data: parsed.data,
          success: true,
          attempts,
          usage: {
            inputTokens: totalInput,
            outputTokens: totalOutput,
            cacheCreationTokens: totalCacheCreate,
            cacheReadTokens: totalCacheRead,
          },
          trace,
        };
      } else {
        const errorMsg = `Your JSON failed schema validation. Please fix these errors and try again: ${parsed.error.message}`;
        
        // add the assistant's failed attempt and the user's correction
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: errorMsg,
              is_error: true,
            }
          ],
        });
      }
    } catch (error: any) {
      trace.push({ attempt: attempts, error: error.message });
      if (attempts >= maxAttempts) {
        return {
          data: null,
          success: false,
          attempts,
          usage: { inputTokens: totalInput, outputTokens: totalOutput, cacheCreationTokens: totalCacheCreate, cacheReadTokens: totalCacheRead },
          error: error.message,
          trace,
        };
      }
    }
  }

  return {
    data: null,
    success: false,
    attempts,
    usage: { inputTokens: totalInput, outputTokens: totalOutput, cacheCreationTokens: totalCacheCreate, cacheReadTokens: totalCacheRead },
    error: "Max retries reached without passing schema validation.",
    trace,
  };
};