import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCreditLines } from "../src/knowledgeBase/loadCreditLines.js";
import { recommend, type CompanyProfile } from "../src/recommendationEngine/rulesEngine.js";

interface EvalCase {
  id: string;
  expected_missing_fields: string[];
  acceptable_lines: string[];
  forbidden_claims: string[];
}

interface EvalFile {
  cases: EvalCase[];
}

const casesPath = join(dirname(fileURLToPath(import.meta.url)), "eval_cases.json");
const evaluation = JSON.parse(readFileSync(casesPath, "utf8")) as EvalFile;
const creditLines = loadCreditLines();

const profiles: Record<string, CompanyProfile> = {
  "caso-1-compra-maquina": { financingPurpose: ["equipment"], companySize: "unknown" },
  "caso-2-mei-necessidades-diferentes": { financingPurpose: ["equipment", "working_capital"], companySize: "mei" },
  "caso-3-pedido-vago": { financingPurpose: [], companySize: "unknown" },
  "caso-4-pedido-impossivel": { financingPurpose: [], companySize: "unknown", asksGuaranteeOrRate: true },
  "caso-5-modernizacao-tecnologia": { financingPurpose: ["technology_services"], companySize: "unknown" },
};

function sorted(values: string[]): string[] {
  return [...values].sort();
}

let passed = 0;
for (const evaluationCase of evaluation.cases.slice(0, 5)) {
  const profile = profiles[evaluationCase.id];
  assert.ok(profile, `Perfil de avaliação ausente: ${evaluationCase.id}`);
  const result = recommend(profile, creditLines);
  assert.deepEqual(sorted(result.missingFields), sorted(evaluationCase.expected_missing_fields), evaluationCase.id);
  assert.ok(
    result.candidates.every((candidate) => evaluationCase.acceptable_lines.includes(candidate.id)),
    `${evaluationCase.id}: candidato fora da lista aceitável`,
  );
  passed += 1;
  console.log(`EVAL OK - ${evaluationCase.id} | status=${result.status} | candidates=${result.candidates.map((candidate) => candidate.id).join(",") || "none"}`);
}

assert.equal(evaluation.cases.length, 8, "A matriz mínima deve conter 8 casos");
console.log(`EVAL INFO - ${passed}/5 casos conversacionais verificados deterministicamente`);
console.log("EVAL INFO - qualidade textual do LLM requer execução com o modelo real; os mocks não medem repetição ou utilidade da prosa");
console.log("EVAL INFO - casos operacionais 6-8 são cobertos por testes HTTP, configuração/build e processo de deploy");