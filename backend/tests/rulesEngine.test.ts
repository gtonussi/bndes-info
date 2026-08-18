import assert from "node:assert/strict";
import { loadCreditLines } from "../src/knowledgeBase/loadCreditLines.js";
import {
  recommend,
  type CompanyProfile,
} from "../src/recommendationEngine/rulesEngine.js";

// Baseline sem LLM: perfis estruturados manuais, espelhando os inputs de tests/eval_cases.json.
// O objetivo é provar que o Recommendation Engine decide corretamente antes de qualquer LLM entrar em cena.

const creditLines = loadCreditLines();

function run(
  name: string,
  profile: CompanyProfile,
  expected: { status: string; candidateIds: string[]; missingFields: string[] },
) {
  const result = recommend(profile, creditLines);

  assert.equal(result.status, expected.status, `[${name}] status`);
  assert.deepEqual(
    result.candidates.map((c) => c.id).sort(),
    [...expected.candidateIds].sort(),
    `[${name}] candidates`,
  );
  assert.deepEqual(
    [...result.missingFields].sort(),
    [...expected.missingFields].sort(),
    `[${name}] missingFields`,
  );

  console.log(`OK - ${name}`);
}

// Caso 1 - compra de máquina
run(
  "caso-1-compra-maquina",
  { financingPurpose: ["equipment"], companySize: "unknown" },
  {
    status: "needs_more_info",
    candidateIds: ["finame"],
    missingFields: ["equipment_origin", "equipment_bndes_approved"],
  },
);

// Caso 2 - MEI com necessidades diferentes (equipamento + capital de giro)
run(
  "caso-2-mei-necessidades-diferentes",
  { financingPurpose: ["equipment", "working_capital"], companySize: "mei" },
  {
    status: "needs_more_info",
    candidateIds: ["finame", "credito-pme", "credito-digital"],
    missingFields: [
      "equipment_origin",
      "equipment_bndes_approved",
      "financing_purpose_priority",
    ],
  },
);

// Caso 3 - pedido ainda vago (sem finalidade)
run(
  "caso-3-pedido-vago",
  { financingPurpose: [], companySize: "unknown" },
  {
    status: "needs_more_info",
    candidateIds: [],
    missingFields: ["financing_purpose"],
  },
);

// Caso 4 - pedido impossível (aprovação garantida / menor taxa)
run(
  "caso-4-pedido-impossivel",
  { financingPurpose: [], companySize: "unknown", asksGuaranteeOrRate: true },
  { status: "refused_premise", candidateIds: [], missingFields: [] },
);

// Caso 5 - modernização com tecnologia
run(
  "caso-5-modernizacao-tecnologia",
  { financingPurpose: ["technology_services"], companySize: "unknown" },
  {
    status: "needs_more_info",
    candidateIds: ["credito-servicos-4-0"],
    missingFields: ["service_provider_bndes_approved"],
  },
);

console.log("\nTodos os casos do baseline determinístico passaram.");
