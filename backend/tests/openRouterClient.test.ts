import assert from "node:assert/strict";
import type { AppConfig } from "../src/core/config.js";
import {
  OpenRouterClient,
  type OpenRouterTransport,
} from "../src/modelGateway/openRouterClient.js";

const config: AppConfig = {
  openRouterApiKey: "test-key",
  openRouterModelPrimary: "model-primary",
  openRouterModelFallback: "model-fallback",
  openRouterBaseUrl: "https://openrouter.test/api/v1",
  requestTimeoutMs: 100,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function run(name: string, test: () => Promise<void>): Promise<void> {
  await test();
  console.log(`OK - ${name}`);
}

await run("usa o modelo primário e extrai o perfil", async () => {
  const calls: Array<{
    url: string;
    model: string;
    authorization: string | null;
    responseFormat?: { type?: string };
  }> = [];
  const transport: OpenRouterTransport = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      response_format?: { type?: string };
    };
    calls.push({
      url: String(input),
      model: body.model,
      authorization: new Headers(init?.headers).get("authorization"),
      responseFormat: body.response_format,
    });
    return jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              financingPurpose: ["equipment"],
              companySize: "unknown",
              asksGuaranteeOrRate: false,
            }),
          },
        },
      ],
    });
  };

  const result = await new OpenRouterClient(config, transport).extractProfile(
    "Quero comprar uma máquina.",
  );

  assert.deepEqual(result.financingPurpose, ["equipment"]);
  assert.equal(result.companySize, "unknown");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://openrouter.test/api/v1/chat/completions");
  assert.equal(calls[0].model, "model-primary");
  assert.equal(calls[0].authorization, "Bearer test-key");
  assert.deepEqual(calls[0].responseFormat, { type: "json_object" });
});

await run("não força JSON ao explicar uma recomendação", async () => {
  let requestBody: { response_format?: unknown } | undefined;
  const transport: OpenRouterTransport = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as {
      response_format?: unknown;
    };
    return jsonResponse({
      choices: [
        {
          message: {
            content: "A linha pode fazer sentido para a necessidade informada.",
          },
        },
      ],
    });
  };

  const result = await new OpenRouterClient(
    config,
    transport,
  ).explainRecommendation(
    "Linha: BNDES Finame",
    "Quero comprar uma máquina nova.",
  );

  assert.equal(
    result,
    "A linha pode fazer sentido para a necessidade informada.",
  );
  assert.equal(requestBody?.response_format, undefined);
});

await run("usa fallback quando o primário falha", async () => {
  const models: string[] = [];
  const transport: OpenRouterTransport = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    models.push(body.model);
    if (body.model === "model-primary")
      return jsonResponse({ error: "rate limit" }, 429);
    return jsonResponse({
      choices: [
        {
          message: {
            content:
              '{"financingPurpose":[],"companySize":"unknown","asksGuaranteeOrRate":true}',
          },
        },
      ],
    });
  };

  const result = await new OpenRouterClient(config, transport).extractProfile(
    "Qual tem a menor taxa?",
  );

  assert.deepEqual(models, ["model-primary", "model-fallback"]);
  assert.equal(result.asksGuaranteeOrRate, true);
});

await run("rejeita resposta que não é JSON", async () => {
  const transport: OpenRouterTransport = async () =>
    jsonResponse({ choices: [{ message: { content: "não sei" } }] });

  await assert.rejects(
    () => new OpenRouterClient(config, transport).extractProfile("Pedido"),
    /não retornou JSON válido/,
  );
});

console.log("\nTodos os casos do Model Gateway passaram.");
