import type { CreditLine } from "../knowledgeBase/loadCreditLines.js";

export type FinancingPurpose =
  | "equipment"
  | "working_capital"
  | "technology_services";
export type CompanySize = "mei" | "micro" | "pequena" | "media" | "unknown";
export type TriState = "yes" | "no" | "unknown";
export type EquipmentOrigin =
  | "novo_nacional"
  | "usado"
  | "importado"
  | "unknown";

// Perfil já extraído da mensagem do usuário (pelo LLM na Fase 2) - o Engine nunca lê texto livre.
export interface CompanyProfile {
  financingPurpose: FinancingPurpose[];
  financingPurposePriority?: FinancingPurpose;
  companySize: CompanySize;
  equipmentOrigin?: EquipmentOrigin;
  equipmentBndesApproved?: TriState;
  serviceProviderBndesApproved?: TriState;
  /** Sinalizado quando o pedido pressupõe aprovação garantida ou "menor taxa". */
  asksGuaranteeOrRate?: boolean;
}

export interface RecommendationCandidate {
  id: string;
  name: string;
  source: CreditLine["source"];
  /** Campos deste candidato específico que ainda precisam ser confirmados. */
  missingFields: string[];
}

export type RecommendationStatus =
  | "refused_premise"
  | "needs_more_info"
  | "ready"
  | "no_match";

export interface RecommendationResult {
  status: RecommendationStatus;
  candidates: RecommendationCandidate[];
  /** União dos campos faltando de todos os candidatos, mais campos gerais (ex: prioridade entre finalidades). */
  missingFields: string[];
}

interface LineEvaluation {
  missingFields: string[];
}

type LineMatcher = (profile: CompanyProfile) => LineEvaluation | null;

const MATCHERS: Record<string, LineMatcher> = {
  finame: (profile) => {
    if (!profile.financingPurpose.includes("equipment")) return null;
    if (
      profile.equipmentOrigin === "usado" ||
      profile.equipmentOrigin === "importado"
    )
      return null;

    const missingFields: string[] = [];
    if (!profile.equipmentOrigin || profile.equipmentOrigin === "unknown")
      missingFields.push("equipment_origin");
    if (
      !profile.equipmentBndesApproved ||
      profile.equipmentBndesApproved === "unknown"
    ) {
      missingFields.push("equipment_bndes_approved");
    }
    return { missingFields };
  },

  "credito-pme": (profile) => {
    if (!profile.financingPurpose.includes("working_capital")) return null;
    return { missingFields: [] };
  },

  "credito-servicos-4-0": (profile) => {
    if (!profile.financingPurpose.includes("technology_services")) return null;

    const missingFields: string[] = [];
    if (
      !profile.serviceProviderBndesApproved ||
      profile.serviceProviderBndesApproved === "unknown"
    ) {
      missingFields.push("service_provider_bndes_approved");
    }
    return { missingFields };
  },

  // Linha genérica: só entra como candidata quando já há alguma finalidade declarada,
  // e é tratada como possibilidade adicional, nunca como conclusão categórica.
  "credito-digital": (profile) => {
    const eligibleSizes: CompanySize[] = ["mei", "micro", "pequena", "media"];
    if (!eligibleSizes.includes(profile.companySize)) return null;
    if (profile.financingPurpose.length === 0) return null;
    return { missingFields: [] };
  },
};

export function recommend(
  profile: CompanyProfile,
  creditLines: CreditLine[],
): RecommendationResult {
  if (profile.asksGuaranteeOrRate) {
    return { status: "refused_premise", candidates: [], missingFields: [] };
  }

  if (profile.financingPurpose.length === 0) {
    return {
      status: "needs_more_info",
      candidates: [],
      missingFields: ["financing_purpose"],
    };
  }

  const candidates: RecommendationCandidate[] = [];
  const missingFields = new Set<string>();

  for (const line of creditLines) {
    const matcher = MATCHERS[line.id];
    if (!matcher) continue;

    const evaluation = matcher(profile);
    if (evaluation === null) continue;

    candidates.push({
      id: line.id,
      name: line.name,
      source: line.source,
      missingFields: evaluation.missingFields,
    });
    evaluation.missingFields.forEach((field) => missingFields.add(field));
  }

  if (
    profile.financingPurpose.length > 1 &&
    !profile.financingPurposePriority
  ) {
    missingFields.add("financing_purpose_priority");
  }

  if (candidates.length === 0) {
    return { status: "no_match", candidates: [], missingFields: [] };
  }

  return {
    status: missingFields.size > 0 ? "needs_more_info" : "ready",
    candidates,
    missingFields: Array.from(missingFields),
  };
}
