import assert from "node:assert/strict";
import { loadCreditLines } from "../src/knowledgeBase/loadCreditLines.js";
import {
  recommend,
  type CompanyProfile,
} from "../src/recommendationEngine/rulesEngine.js";

const creditLines = loadCreditLines();

function run(
  name: string,
  profile: CompanyProfile,
  expected: { status: string; candidates: string[]; missingFields: string[] },
): void {
  const result = recommend(profile, creditLines);
  assert.equal(result.status, expected.status, `[${name}] status`);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.id).sort(),
    [...expected.candidates].sort(),
    `[${name}] candidates`,
  );
  assert.deepEqual(
    [...result.missingFields].sort(),
    [...expected.missingFields].sort(),
    `[${name}] missingFields`,
  );
  console.log(`OK - ${name}`);
}

run(
  "equipamento novo e credenciado fica pronto para Finame",
  {
    financingPurpose: ["equipment"],
    companySize: "unknown",
    equipmentOrigin: "novo_nacional",
    equipmentBndesApproved: "yes",
  },
  { status: "ready", candidates: ["finame"], missingFields: [] },
);

run(
  "equipamento usado não entra como Finame",
  {
    financingPurpose: ["equipment"],
    companySize: "unknown",
    equipmentOrigin: "usado",
    equipmentBndesApproved: "unknown",
  },
  { status: "no_match", candidates: [], missingFields: [] },
);

run(
  "equipamento importado não entra como Finame",
  {
    financingPurpose: ["equipment"],
    companySize: "unknown",
    equipmentOrigin: "importado",
    equipmentBndesApproved: "unknown",
  },
  { status: "no_match", candidates: [], missingFields: [] },
);

run(
  "capital de giro fica pronto para Crédito PME",
  { financingPurpose: ["working_capital"], companySize: "unknown" },
  { status: "ready", candidates: ["credito-pme"], missingFields: [] },
);

run(
  "serviço tecnológico credenciado fica pronto",
  {
    financingPurpose: ["technology_services"],
    companySize: "unknown",
    serviceProviderBndesApproved: "yes",
  },
  { status: "ready", candidates: ["credito-servicos-4-0"], missingFields: [] },
);

run(
  "múltiplas finalidades com prioridade ainda pede dados do equipamento",
  {
    financingPurpose: ["equipment", "working_capital"],
    financingPurposePriority: "working_capital",
    companySize: "unknown",
  },
  {
    status: "needs_more_info",
    candidates: ["finame", "credito-pme"],
    missingFields: ["equipment_origin", "equipment_bndes_approved"],
  },
);

console.log("\nTodos os casos adicionais do Recommendation Engine passaram.");
