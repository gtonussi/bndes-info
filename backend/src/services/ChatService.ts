import type { AppConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import type { CreditLine } from "../knowledgeBase/loadCreditLines.js";
import { loadCreditLines } from "../knowledgeBase/loadCreditLines.js";
import {
  OpenRouterClient,
  type ExtractionResult,
} from "../modelGateway/openRouterClient.js";
import { recommend } from "../recommendationEngine/rulesEngine.js";
import { validateOutput } from "../validators/outputValidator.js";

export interface ChatRequest {
  message: string;
  conversationId?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ChatResponse {
  message: string;
  citations: Array<{ url: string; date: string }>;
  nextQuestion?: string;
  conversationId: string;
}

export class ChatService {
  private client: OpenRouterClient;
  private creditLines: CreditLine[];

  constructor(config: AppConfig) {
    this.client = new OpenRouterClient(config);
    this.creditLines = loadCreditLines();
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const conversationId =
      request.conversationId?.trim() || Math.random().toString(36).slice(2, 11);
    const requestId = Math.random().toString(36).slice(2, 11);

    try {
      logger.info("Chat request received", {
        conversationId,
        requestId,
        messageLength: request.message.length,
      });

      // Passo 1: extrair perfil da empresa
      const extractionInput = this.buildExtractionInput(request);
      const profile = await this.client.extractProfile(extractionInput);
      logger.info("profile extracted", {
        conversationId,
        requestId,
        purposes: profile.financingPurpose,
        companySize: profile.companySize,
        asksGuaranteeOrRate: profile.asksGuaranteeOrRate,
        historyTurns: request.conversationHistory?.length ?? 0,
      });

      // Passo 2: recusar premissa inadequada (caso 4)
      if (profile.asksGuaranteeOrRate) {
        const response = await this.client.explainRecommendation(
          `O usuário perguntou: "${request.message}"\n\nEsta pergunta pressupõe aprovação garantida ou menor taxa. Você deve recusar a premissa e explicar por que o BNDES não pode garantir essas coisas.`,
          "",
        );
        logger.info("Premise refused", { conversationId, requestId });
        return this.finalizeResponse(conversationId, response, []);
      }

      // Passo 3: passar pelo Recommendation Engine
      const recommendation = recommend(profile, this.creditLines);
      logger.info("recommendation evaluated", {
        conversationId,
        requestId,
        status: recommendation.status,
        candidateIds: recommendation.candidates.map(
          (candidate) => candidate.id,
        ),
        missingFields: recommendation.missingFields,
      });

      // Passo 4: se ainda faltam dados (caso 3), pedir mais informações
      if (recommendation.status === "needs_more_info") {
        const questionSummary = this.generateQuestion(
          recommendation.missingFields,
          profile,
        );
        const response = await this.client.explainRecommendation(
          questionSummary,
          request.message,
        );
        logger.info("Asking for more info", {
          conversationId,
          requestId,
          missingFields: recommendation.missingFields,
        });
        return this.finalizeResponse(conversationId, response, []);
      }

      // Passo 5: se nenhum candidato (no_match)
      if (recommendation.status === "no_match") {
        const response = await this.client.explainRecommendation(
          "Não encontrei linhas de crédito BNDES que correspondam à descrição fornecida. Pode tentar descrever melhor a necessidade?",
          request.message,
        );
        logger.info("No match found", { conversationId, requestId });
        return this.finalizeResponse(conversationId, response, []);
      }

      // Passo 6: montar contexto das linhas recomendadas e gerar explicação
      const creditLinesInfo = recommendation.candidates
        .map((cand) => {
          const line = this.creditLines.find((l) => l.id === cand.id)!;
          return `Linha: ${line.name}\nO que financia: ${line.whatItFinances}\nCondições: ${line.conditionsLimitations}\nFonte: ${line.source.url} (consultada em ${line.source.consultedAt})`;
        })
        .join("\n\n");

      const explanation = await this.client.explainRecommendation(
        `Baseado na necessidade do usuário, as seguintes linhas podem fazer sentido:\n\n${creditLinesInfo}\n\nExplique por que cada uma pode ser relevante, sempre citando a fonte e data de consulta. Inclua um disclaimer no final.`,
        request.message,
      );

      // Passo 7: validar a resposta
      const citations = recommendation.candidates.map((cand) => {
        const line = this.creditLines.find((l) => l.id === cand.id)!;
        return { url: line.source.url, date: line.source.consultedAt };
      });

      logger.info("Chat completed", {
        conversationId,
        requestId,
        candidateCount: recommendation.candidates.length,
      });
      return this.finalizeResponse(
        conversationId,
        explanation,
        citations,
        requestId,
      );
    } catch (error) {
      logger.error("Chat error", { conversationId, requestId, error });
      throw error;
    }
  }

  private generateQuestion(
    missingFields: string[],
    profile: ExtractionResult,
  ): string {
    const fieldLabels: Record<string, string> = {
      financing_purpose:
        "a finalidade do crédito (compra de equipamentos, capital de giro, etc.)",
      financing_purpose_priority:
        "qual é a prioridade entre as finalidades mencionadas",
      equipment_origin: "se o equipamento é novo, usado ou importado",
      equipment_bndes_approved: "se o equipamento está credenciado pelo BNDES",
      service_provider_bndes_approved:
        "se o prestador de serviço está credenciado pelo BNDES",
    };

    const fields = missingFields.map((f) => fieldLabels[f] || f).join(", ");
    return `Para refinar as recomendações, você poderia esclarecer: ${fields}?`;
  }

  private buildExtractionInput(request: ChatRequest): string {
    if (!request.conversationHistory?.length) return request.message;

    const history = request.conversationHistory
      .slice(-10)
      .map(
        (turn) =>
          `${turn.role === "user" ? "Usuário" : "Assistente"}: ${turn.content}`,
      )
      .join("\n");
    return `Histórico da conversa (use apenas como contexto; não invente fatos):\n${history}\nUsuário: ${request.message}`;
  }

  private finalizeResponse(
    conversationId: string,
    message: string,
    citations: Array<{ url: string; date: string }>,
    requestId?: string,
  ): ChatResponse {
    const validated = validateOutput(message, this.creditLines);
    if (!validated.isValid) {
      logger.warn("Output validation failed", {
        conversationId,
        requestId,
        violations: validated.violations,
      });
      return {
        conversationId,
        message:
          "Não consegui gerar uma explicação segura para esta solicitação. Consulte as fontes oficiais do BNDES e confirme as condições com um agente financeiro.",
        citations,
      };
    }
    logger.info("response validated", {
      conversationId,
      requestId,
      citations: citations.length,
      messageLength: message.length,
    });
    return { conversationId, message: validated.message, citations };
  }

  private toResponse(
    conversationId: string,
    message: string,
    citations: Array<{ url: string; date: string }>,
  ): ChatResponse {
    return { message, citations, conversationId };
  }
}
