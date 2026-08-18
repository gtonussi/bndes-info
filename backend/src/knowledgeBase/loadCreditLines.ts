import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../core/logger.js";

export interface CreditLineSource {
  url: string;
  publisher: string;
  consultedAt: string;
}

export interface CreditLine {
  id: string;
  name: string;
  targetAudience: string;
  whatItFinances: string;
  conditionsLimitations: string;
  howToApply: string;
  source: CreditLineSource;
}

interface RawCreditLine {
  id: string;
  name: string;
  target_audience: string;
  what_it_finances: string;
  conditions_limitations: string;
  how_to_apply: string;
  source: { url: string; publisher: string; consulted_at: string };
}

interface RawCreditLinesFile {
  linhas: RawCreditLine[];
}

// backend/src/knowledgeBase/../../data/linhas_credito.json
const DEFAULT_DATA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "linhas_credito.json",
);

function toCreditLine(raw: RawCreditLine): CreditLine {
  const requiredFields: Array<keyof RawCreditLine> = [
    "id",
    "name",
    "target_audience",
    "what_it_finances",
    "conditions_limitations",
    "how_to_apply",
  ];
  for (const field of requiredFields) {
    if (typeof raw[field] !== "string" || raw[field].trim().length === 0) {
      throw new Error(`Linha de crédito inválida: campo "${field}" ausente.`);
    }
  }
  if (
    !raw.source ||
    raw.source.publisher !== "BNDES" ||
    !raw.source.url.startsWith("https://www.bndes.gov.br/") ||
    !raw.source.consulted_at
  ) {
    throw new Error(
      `Linha de crédito inválida: fonte oficial ausente para "${raw.id}".`,
    );
  }

  return {
    id: raw.id,
    name: raw.name,
    targetAudience: raw.target_audience,
    whatItFinances: raw.what_it_finances,
    conditionsLimitations: raw.conditions_limitations,
    howToApply: raw.how_to_apply,
    source: {
      url: raw.source.url,
      publisher: raw.source.publisher,
      consultedAt: raw.source.consulted_at,
    },
  };
}

export function loadCreditLines(
  path: string = DEFAULT_DATA_PATH,
): CreditLine[] {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as RawCreditLinesFile;

  if (!Array.isArray(parsed.linhas)) {
    throw new Error(
      'linhas_credito.json malformado: campo "linhas" ausente ou inválido.',
    );
  }

  const creditLines = parsed.linhas.map(toCreditLine);
  logger.info("Credit lines loaded", {
    domain: "knowledge_base",
    count: creditLines.length,
    ids: creditLines.map((line) => line.id),
  });
  return creditLines;
}
