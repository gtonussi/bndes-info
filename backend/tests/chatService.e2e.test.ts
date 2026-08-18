import assert from "node:assert/strict";
import type { AppConfig } from "../src/core/config.js";
import type { OpenRouterTransport } from "../src/modelGateway/openRouterClient.js";
import { OpenRouterClient } from "../src/modelGateway/openRouterClient.js";
import { ChatService } from "../src/services/ChatService.js";

const mockConfig: AppConfig = {
  openRouterApiKey: "test",
  openRouterModelPrimary: "test-model",
  openRouterBaseUrl: "https://test.local/api/v1",
  requestTimeoutMs: 5000,
};

// Mock responses por tipo de pedido
const responseMap: Record<string, string> = {
  "tenho uma pequena indústria": JSON.stringify({
    financingPurpose: ["equipment"],
    companySize: "pequena",
    equipmentOrigin: "unknown",
    equipmentBndesApproved: "unknown",
    asksGuaranteeOrRate: false,
  }),
  "qual linha": JSON.stringify({
    financingPurpose: [],
    companySize: "unknown",
    asksGuaranteeOrRate: true,
  }),
  "sou mei": JSON.stringify({
    financingPurpose: ["equipment", "working_capital"],
    companySize: "mei",
    equipmentOrigin: "unknown",
    equipmentBndesApproved: "unknown",
    asksGuaranteeOrRate: false,
  }),
  "ainda não sei": JSON.stringify({
    financingPurpose: [],
    companySize: "unknown",
    asksGuaranteeOrRate: false,
  }),
  "contratar serviços": JSON.stringify({
    financingPurpose: ["technology_services"],
    companySize: "unknown",
    serviceProviderBndesApproved: "unknown",
    asksGuaranteeOrRate: false,
  }),
};

const explanationMap: Record<string, string> = {
  "A linha BNDES Finame":
    "Com base em sua necessidade, o BNDES Finame parece compatível, pois financia máquinas e equipamentos novos de fabricação nacional. Segundo a página consultada em 2026-08-18 (https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-finame-todos), você precisará verificar se o equipamento está credenciado. Esta indicação não representa aprovação de crédito.",
  "não posso garantir":
    "Entendo que gostaria de saber qual linha tem aprovação garantida com a menor taxa. Infelizmente, não posso garantir aprovação de crédito nem afirmar qual será a taxa final. A aprovação depende da análise de elegibilidade do agente financeiro. Esta indicação não representa aprovação de crédito.",
  "Para refinar":
    "Para refinar as recomendações, você poderia esclarecer: qual é a prioridade entre as finalidades mencionadas?",
  "ainda não sei exatamente":
    "Entendo. Para oferecer uma recomendação útil, você poderia descrever melhor como pretende usar o dinheiro? Por exemplo: compra de equipamentos, capital de giro, serviços de tecnologia?",
  "Crédito Serviços 4.0":
    "O BNDES Crédito Serviços 4.0 permite financiar serviços tecnológicos credenciados, como digitalização e modernização. Conforme consultado em 2026-08-18 (https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-credito-servicos-4.0), é necessário que o prestador esteja credenciado. Esta indicação não representa aprovação de crédito.",
};

function createMockTransport(): OpenRouterTransport {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string }>;
    };
    const userMessage =
      body.messages.find((m) => (m as any).role === "user")?.content || "";
    const lowerMsg = userMessage.toLowerCase();

    let response = "Desculpe, não consegui processar.";

    // Procura por chave aproximada na mensagem
    for (const [key, value] of Object.entries(responseMap)) {
      if (lowerMsg.includes(key)) {
        try {
          JSON.parse(value);
          return new Response(
            JSON.stringify({ choices: [{ message: { content: value } }] }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        } catch {
          // Continue searching
        }
      }
    }

    // Para explicação, procura por chave em explanationMap
    for (const [key, value] of Object.entries(explanationMap)) {
      if (
        lowerMsg.includes(key) ||
        lowerMsg.includes("baseado") ||
        lowerMsg.includes("refinar")
      ) {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: value } }] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
    }

    return new Response(
      JSON.stringify({ choices: [{ message: { content: response } }] }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };
}

class ChatServiceWithMock extends ChatService {
  constructor(config: AppConfig, transport: OpenRouterTransport) {
    super(config);
    (this as any).client = new OpenRouterClient(config, transport);
  }
}

async function run(name: string, test: () => Promise<void>) {
  await test();
  console.log(`OK - ${name}`);
}

await run("Caso 1: Compra de máquina", async () => {
  const service = new ChatServiceWithMock(mockConfig, createMockTransport());
  const response = await service.chat({
    message:
      "Tenho uma pequena indústria e quero comprar uma máquina nova para aumentar a produção.",
    conversationId: "conversa-teste",
    conversationHistory: [
      { role: "user", content: "Preciso financiar uma expansão." },
      { role: "assistant", content: "Qual é a finalidade do financiamento?" },
    ],
  });

  assert.ok(response.message, "Deve ter resposta");
  assert.equal(
    response.conversationId,
    "conversa-teste",
    "Deve preservar o ID de conversa",
  );
});

await run("Caso 3: Pedido vago", async () => {
  const service = new ChatServiceWithMock(mockConfig, createMockTransport());
  const response = await service.chat({
    message:
      "Quero um financiamento, mas ainda não sei exatamente como vou usar o dinheiro.",
  });

  assert.ok(response.message, "Deve ter resposta");
});

await run("Caso 4: Pedido impossível", async () => {
  const service = new ChatServiceWithMock(mockConfig, createMockTransport());
  const response = await service.chat({
    message: "Qual linha possui aprovação garantida e a menor taxa?",
  });

  assert.ok(response.message, "Deve ter resposta");
});

await run("Caso 5: Modernização com tecnologia", async () => {
  const service = new ChatServiceWithMock(mockConfig, createMockTransport());
  const response = await service.chat({
    message:
      "Minha empresa quer contratar serviços de tecnologia para modernizar seus processos.",
  });

  assert.ok(response.message, "Deve ter resposta");
});

console.log("\nTodos os casos de ponta a ponta passaram.");
