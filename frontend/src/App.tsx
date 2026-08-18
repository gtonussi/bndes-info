import { useState } from "react";
import { ChatWindow, type ChatMessage } from "./components/ChatWindow";
import { frontendLogger } from "./core/logger";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const REQUEST_TIMEOUT_MS = 30_000;

interface ChatApiPayload {
  message?: string;
  citations?: ChatMessage["citations"];
  conversationId?: string;
  error?: string;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();

  async function sendMessage(content: string) {
    const startedAt = performance.now();
    const history = messages.map(({ role, content: text }) => ({
      role,
      content: text,
    }));
    setMessages((current) => [...current, { role: "user", content }]);
    setError(undefined);
    setIsSending(true);
    frontendLogger.info("chat request started", {
      messageLength: content.length,
      historyTurns: history.length,
      hasConversation: Boolean(conversationId),
    });

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: content,
          conversationId,
          conversationHistory: history,
        }),
      });
      const responseText = await response.text();
      let payload: ChatApiPayload = {};
      try {
        payload = responseText
          ? (JSON.parse(responseText) as ChatApiPayload)
          : {};
      } catch {
        throw new Error("O servidor retornou uma resposta inválida.");
      }
      if (!response.ok)
        throw new Error(
          payload.error ?? "Não foi possível consultar o assistente.",
        );

      setConversationId(payload.conversationId);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.message ?? "Não recebi uma resposta válida.",
          citations: payload.citations,
        },
      ]);
      frontendLogger.info("chat request succeeded", {
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        citations: payload.citations?.length ?? 0,
      });
    } catch (requestError) {
      const message =
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
          ? "A consulta demorou mais que o esperado. Tente novamente."
          : requestError instanceof Error
            ? requestError.message
            : "Não foi possível consultar o assistente.";
      setError(message);
      frontendLogger.error("chat request failed", {
        durationMs: Math.round(performance.now() - startedAt),
        reason: message,
      });
    } finally {
      window.clearTimeout(timeout);
      setIsSending(false);
    }
  }

  function startNewConversation() {
    setMessages([]);
    setConversationId(undefined);
    setError(undefined);
    frontendLogger.info("conversation reset");
  }

  return (
    <main className="app-shell">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          B
        </div>
        <div>
          <p className="eyebrow">BNDES · ORIENTAÇÃO</p>
          <h1>BNDES Info</h1>
        </div>
        <button
          className="new-chat-button"
          onClick={startNewConversation}
          type="button"
        >
          <span aria-hidden="true">+</span> Nova conversa
        </button>
      </header>
      <section className="workspace">
        <aside className="intro-panel">
          <span className="section-number">01</span>
          <p className="kicker">Seu próximo passo</p>
          <h2>Encontre clareza antes de pedir crédito.</h2>
          <p className="intro-copy">
            Descreva o que sua empresa precisa financiar. Eu organizo as
            possibilidades com base em informações oficiais do BNDES.
          </p>
          <div className="trust-note">
            <span className="trust-dot" />
            <span>Orientação baseada em fontes oficiais</span>
          </div>
          <div className="rule-list">
            <div>
              <strong>Não aprova</strong>
              <span>Crédito ou cadastro</span>
            </div>
            <div>
              <strong>Não promete</strong>
              <span>Taxas ou condições</span>
            </div>
          </div>
        </aside>
        <ChatWindow
          messages={messages}
          isSending={isSending}
          error={error}
          onSend={sendMessage}
        />
      </section>
      <footer className="footer-note">
        As condições finais dependem da análise de elegibilidade e do agente
        financeiro.
      </footer>
    </main>
  );
}
