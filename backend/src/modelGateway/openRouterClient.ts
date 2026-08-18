import type { AppConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import type {
  CompanySize,
  EquipmentOrigin,
  FinancingPurpose,
  TriState,
} from "../recommendationEngine/rulesEngine.js";

export interface ExtractionResult {
  financingPurpose: FinancingPurpose[];
  financingPurposePriority?: FinancingPurpose;
  companySize: CompanySize;
  equipmentOrigin?: EquipmentOrigin;
  equipmentBndesApproved?: TriState;
  serviceProviderBndesApproved?: TriState;
  asksGuaranteeOrRate: boolean;
}

export interface OpenRouterTransport {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

const EXTRACTION_SYSTEM_PROMPT = `Você extrai dados de pedidos sobre financiamento BNDES.
Responda SOMENTE JSON válido, sem markdown, com este formato:
{"financingPurpose":[],"financingPurposePriority":null,"companySize":"unknown","equipmentOrigin":"unknown","equipmentBndesApproved":"unknown","serviceProviderBndesApproved":"unknown","asksGuaranteeOrRate":false}
Valores permitidos: financingPurpose = equipment, working_capital, technology_services; companySize = mei, micro, pequena, media, unknown; equipmentOrigin = novo_nacional, usado, importado, unknown; campos de aprovação = yes, no, unknown.
Não deduza fatos que não estejam na mensagem. Use arrays vazios, null ou unknown quando faltar informação. Marque asksGuaranteeOrRate como true se a pessoa pedir aprovação garantida, menor taxa ou garantia de aprovação.`;

export class OpenRouterClient {
  private readonly transport: OpenRouterTransport;

  constructor(
    private readonly config: AppConfig,
    transport: OpenRouterTransport = fetch,
  ) {
    this.transport = transport;
  }

  async extractProfile(userMessage: string): Promise<ExtractionResult> {
    const content = await this.complete(EXTRACTION_SYSTEM_PROMPT, userMessage);
    return parseExtraction(content);
  }

  async explainRecommendation(
    creditLinesSummary: string,
    userProfile: string,
  ): Promise<string> {
    const systemPrompt = `Você é um assistente que explica recomendações de linhas de crédito do BNDES em português.
Responda em texto natural, claro e direto, sem repetir a mensagem do usuário.
Organize a resposta em no máximo três blocos curtos: "O que faz sentido", "O que falta confirmar" e "Próximo passo". Use somente os blocos necessários.
Sempre cite a fonte e a data de consulta quando mencionar uma linha ou condição.
Não invente valores, taxas, prazos, garantias ou critérios que não estejam no contexto confiável.
Nunca use frases como "aprovação garantida", "menor taxa", "está garantido" ou similares.
Não inclua um disclaimer em uma simples pergunta de esclarecimento. Quando apresentar uma linha de crédito, inclua uma única frase final: "Esta indicação não representa aprovação de crédito; as condições finais dependem da análise do agente financeiro."`;
    const promptContext = [
      `Necessidade informada pelo usuário: ${userProfile || "não disponível"}`,
      "Contexto confiável da aplicação:",
      creditLinesSummary,
    ].join("\n\n");
    return this.complete(systemPrompt, promptContext);
  }

  private async complete(
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    const models = [
      this.config.openRouterModelPrimary,
      this.config.openRouterModelFallback,
    ].filter((model): model is string => Boolean(model));
    let lastError: unknown;

    for (const model of models) {
      const startedAt = performance.now();
      logger.info("model request started", { model });
      try {
        const result = await this.request(model, systemPrompt, userMessage);
        logger.info("model request succeeded", {
          model,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return result;
      } catch (error) {
        logger.warn("model request failed; trying next model", {
          model,
          durationMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : "unknown error",
        });
        lastError = error;
      }
    }

    throw new Error(
      `OpenRouter indisponível após ${models.length} tentativa(s).`,
      { cause: lastError },
    );
  }

  private async request(
    model: string,
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );

    try {
      const response = await this.transport(
        `${this.config.openRouterBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.openRouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://bndes-info.local",
            "X-Title": "BNDES Info",
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok)
        throw new Error(`OpenRouter respondeu HTTP ${response.status}.`);

      const payload = (await response.json()) as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("OpenRouter retornou conteúdo vazio.");
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseExtraction(content: string): ExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("A extração do OpenRouter não retornou JSON válido.", {
      cause: error,
    });
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.financingPurpose)) {
    throw new Error("A extração do OpenRouter não possui o formato esperado.");
  }

  const purposes = parsed.financingPurpose.filter(isFinancingPurpose);
  const companySize = isCompanySize(parsed.companySize)
    ? parsed.companySize
    : "unknown";
  return {
    financingPurpose: purposes,
    financingPurposePriority: isFinancingPurpose(
      parsed.financingPurposePriority,
    )
      ? parsed.financingPurposePriority
      : undefined,
    companySize,
    equipmentOrigin: isEquipmentOrigin(parsed.equipmentOrigin)
      ? parsed.equipmentOrigin
      : "unknown",
    equipmentBndesApproved: isTriState(parsed.equipmentBndesApproved)
      ? parsed.equipmentBndesApproved
      : "unknown",
    serviceProviderBndesApproved: isTriState(
      parsed.serviceProviderBndesApproved,
    )
      ? parsed.serviceProviderBndesApproved
      : "unknown",
    asksGuaranteeOrRate: parsed.asksGuaranteeOrRate === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFinancingPurpose(value: unknown): value is FinancingPurpose {
  return (
    value === "equipment" ||
    value === "working_capital" ||
    value === "technology_services"
  );
}

function isCompanySize(value: unknown): value is CompanySize {
  return (
    value === "mei" ||
    value === "micro" ||
    value === "pequena" ||
    value === "media" ||
    value === "unknown"
  );
}

function isEquipmentOrigin(value: unknown): value is EquipmentOrigin {
  return (
    value === "novo_nacional" ||
    value === "usado" ||
    value === "importado" ||
    value === "unknown"
  );
}

function isTriState(value: unknown): value is TriState {
  return value === "yes" || value === "no" || value === "unknown";
}
