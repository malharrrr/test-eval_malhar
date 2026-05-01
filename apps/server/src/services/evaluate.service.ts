import * as stringSimilarity from "string-similarity";
import type { ClinicalExtraction } from "@healos/shared";

export const calculateSimilarity = (str1?: string | null, str2?: string | null): number => {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;
  return stringSimilarity.compareTwoStrings(str1.toLowerCase().trim(), str2.toLowerCase().trim());
};

// returns true if strings are similar enough
export const isFuzzyMatch = (str1?: string | null, str2?: string | null, threshold = 0.8): boolean => {
  return calculateSimilarity(str1, str2) >= threshold;
};

export const calculateF1 = (precision: number, recall: number): number => {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
};

// text normalization 
export const normalizeMedText = (text: string): string => {
  return text.toLowerCase().trim()
    .replace(/\bbid\b/g, "twice daily")
    .replace(/\btid\b/g, "three times daily")
    .replace(/\bpo\b/g, "by mouth")
    .replace(/\bprn\b/g, "as needed")
    .replace(/mg/g, " mg"); 
};

export const evaluateVitals = (pred: ClinicalExtraction["vitals"], gold: ClinicalExtraction["vitals"]): number => {
  let score = 0;
  const total = 4; 
  if (pred.bp === gold.bp) score++;
  if (pred.hr === gold.hr) score++;
  if (pred.spo2 === gold.spo2) score++;
  if (pred.temp_f === gold.temp_f) {
    score++;
  } else if (pred.temp_f !== null && gold.temp_f !== null && Math.abs(pred.temp_f - gold.temp_f) <= 0.2) {
    score++;
  }

  return score / total; 
};

export const evaluateMedications = (pred: ClinicalExtraction["medications"], gold: ClinicalExtraction["medications"]): number => {
  if (pred.length === 0 && gold.length === 0) return 1;
  if (pred.length === 0 || gold.length === 0) return 0;

  let correctMatches = 0;
  // medication matching is tricky - we require fuzzy name match + exact dose/freq match to count as correct
  for (const p of pred) {
    const isMatch = gold.some(g => {
      const nameMatch = isFuzzyMatch(p.name, g.name, 0.75);
      const doseFreqMatch = 
        normalizeMedText(p.dose) === normalizeMedText(g.dose) &&
        normalizeMedText(p.frequency) === normalizeMedText(g.frequency);
      return nameMatch && doseFreqMatch;
    });
    if (isMatch) correctMatches++;
  }

  const precision = correctMatches / pred.length;
  const recall = correctMatches / gold.length;
  return calculateF1(precision, recall);
};

export const evaluateDiagnoses = (pred: ClinicalExtraction["diagnoses"], gold: ClinicalExtraction["diagnoses"]): number => {
  if (pred.length === 0 && gold.length === 0) return 1;
  if (pred.length === 0 || gold.length === 0) return 0;

  let correctMatches = 0;

  for (const p of pred) {
    const isMatch = gold.some(g => {
      const descMatch = isFuzzyMatch(p.description, g.description, 0.8);
      // Bonus: Check ICD10 if provided
      const icdMatch = (p.icd10 && g.icd10) ? p.icd10 === g.icd10 : true; 
      return descMatch && icdMatch;
    });
    if (isMatch) correctMatches++;
  }

  return calculateF1(correctMatches / pred.length, correctMatches / gold.length);
};

export const evaluatePlan = (pred: string[], gold: string[]): number => {
  if (pred.length === 0 && gold.length === 0) return 1;
  if (pred.length === 0 || gold.length === 0) return 0;

  let correctMatches = 0;
  for (const p of pred) {
    if (gold.some(g => isFuzzyMatch(p, g, 0.75))) correctMatches++;
  }
  return calculateF1(correctMatches / pred.length, correctMatches / gold.length);
};

export const detectHallucinations = (pred: ClinicalExtraction, transcript: string): number => {
  let hallucinations = 0;
  const transcriptLower = transcript.toLowerCase();

  // to check if a value is grounded in the text
  const isGrounded = (val?: string | null) => {
    if (!val) return true; 
    const cleanVal = val.toLowerCase().trim();
    
    // direct substring match
    if (transcriptLower.includes(cleanVal)) return true;
    
    // fallback to substring fuzzy check for slight variations
    const words = cleanVal.split(" ");
    const matchCount = words.filter(w => transcriptLower.includes(w)).length;
    return (matchCount / words.length) >= 0.5; // at least half the words must exist in the text
  };
  if (!isGrounded(pred.chief_complaint)) hallucinations++;
  
  pred.diagnoses.forEach(d => {
    if (!isGrounded(d.description)) hallucinations++;
  });

  pred.plan.forEach(p => {
    if (!isGrounded(p)) hallucinations++;
  });

  return hallucinations;
};

export const evaluateCase = (pred: ClinicalExtraction, gold: ClinicalExtraction, transcript: string) => {
  return {
    chief_complaint: calculateSimilarity(pred.chief_complaint, gold.chief_complaint),
    vitals: evaluateVitals(pred.vitals, gold.vitals),
    medications: evaluateMedications(pred.medications, gold.medications),
    diagnoses: evaluateDiagnoses(pred.diagnoses, gold.diagnoses),
    plan: evaluatePlan(pred.plan, gold.plan),
    follow_up: (pred.follow_up.interval_days === gold.follow_up.interval_days && isFuzzyMatch(pred.follow_up.reason, gold.follow_up.reason)) ? 1 : 0,
    hallucinationCount: detectHallucinations(pred, transcript)
  };
};