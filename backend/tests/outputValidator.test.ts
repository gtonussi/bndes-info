import assert from "node:assert/strict";
import { loadCreditLines } from "../src/knowledgeBase/loadCreditLines.js";
import { validateOutput } from "../src/validators/outputValidator.js";

const creditLines = loadCreditLines();

function run(name: string, test: () => void): void {
  test();
  console.log(`OK - ${name}`);
}

run("bloqueia promessa de aprovação ou menor taxa", () => {
  const result = validateOutput(
    "A aprovação é garantida e esta é a menor taxa.",
    creditLines,
  );

  assert.equal(result.isValid, false);
  assert.ok(result.violations.length >= 2);
});

run("permite menção neutra a taxa e aprovação", () => {
  const result = validateOutput(
    "A taxa e a aprovação dependem da análise do agente financeiro.",
    creditLines,
  );

  assert.equal(result.isValid, true);
});

run("aceita fonte oficial com pontuação final", () => {
  const result = validateOutput(
    `Consulte ${creditLines[0].source.url}.`,
    creditLines,
  );

  assert.equal(result.isValid, true);
});

run("rejeita URL fora da allow-list", () => {
  const result = validateOutput(
    "Consulte https://example.com/credito.",
    creditLines,
  );

  assert.equal(result.isValid, false);
  assert.match(result.violations[0], /allow-list/);
});

console.log("\nTodos os testes do Output Validator passaram.");
