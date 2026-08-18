import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { ChatServiceLike } from "../src/api/routes/chat.routes.js";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/core/config.js";

const config: AppConfig = {
  openRouterApiKey: "test-key",
  openRouterModelPrimary: "test-model",
  openRouterBaseUrl: "https://openrouter.test/api/v1",
  requestTimeoutMs: 100,
};

async function withServer(
  chatService: ChatServiceLike,
  test: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(createApp(config, chatService));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Servidor não iniciou.");

  try {
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function run(name: string, test: () => Promise<void>): Promise<void> {
  await test();
  console.log(`OK - ${name}`);
}

const successfulService: ChatServiceLike = {
  async chat(request) {
    return {
      conversationId: request.conversationId ?? "generated-id",
      message: request.message,
      citations: [],
    };
  },
};

await run("GET /health retorna 200 quando a chave está presente", async () => {
  await withServer(successfulService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await json(response);

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.openRouterApiKey, "present");
  });
});

await run("GET /health retorna 503 sem a chave", async () => {
  const app = createApp({ ...config, openRouterApiKey: "" }, successfulService);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Servidor não iniciou.");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await json(response);
    assert.equal(response.status, 503);
    assert.equal(body.status, "degraded");
    assert.equal(body.openRouterApiKey, "missing");
  } finally {
    await closeServer(server);
  }
});

await run("POST /chat rejeita mensagem ausente", async () => {
  await withServer(successfulService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 400);
    assert.match(String((await json(response)).error), /message é obrigatório/);
  });
});

await run("POST /chat rejeita histórico inválido", async () => {
  await withServer(successfulService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Pedido válido",
        conversationHistory: Array.from({ length: 11 }, () => ({
          role: "user",
          content: "x",
        })),
      }),
    });

    assert.equal(response.status, 400);
    assert.match(String((await json(response)).error), /conversationHistory/);
  });
});

await run("POST /chat encaminha mensagem e conversa", async () => {
  let received: { message: string; conversationId?: string } | undefined;
  const service: ChatServiceLike = {
    async chat(request) {
      received = {
        message: request.message,
        conversationId: request.conversationId,
      };
      return {
        conversationId: "conversa-1",
        message: "Resposta",
        citations: [],
      };
    },
  };

  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "  Pedido válido  ",
        conversationId: "conversa-1",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      message: "Pedido válido",
      conversationId: "conversa-1",
    });
    assert.equal((await json(response)).conversationId, "conversa-1");
  });
});

await run(
  "POST /chat converte indisponibilidade do provedor em 503",
  async () => {
    const service: ChatServiceLike = {
      async chat() {
        throw new Error("OpenRouter indisponível após 2 tentativa(s).");
      },
    };

    await withServer(service, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Pedido válido" }),
      });
      const body = await json(response);

      assert.equal(response.status, 503);
      assert.equal(
        body.error,
        "O serviço de recomendação está temporariamente indisponível. Tente novamente mais tarde.",
      );
      assert.doesNotMatch(String(body.error), /OpenRouter indisponível/);
    });
  },
);

await run("OPTIONS /chat responde com CORS", async () => {
  await withServer(successfulService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/chat`, { method: "OPTIONS" });
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("access-control-allow-methods"),
      "GET,POST,OPTIONS",
    );
  });
});

console.log("\nTodos os testes HTTP passaram.");
