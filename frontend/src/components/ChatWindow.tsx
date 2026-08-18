import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ url: string; date: string }>;
}
interface ChatWindowProps {
  messages: ChatMessage[];
  isSending: boolean;
  error?: string;
  onSend: (message: string) => Promise<void>;
}
const suggestions = [
  "Quero comprar uma máquina para minha empresa",
  "Preciso de capital de giro",
  "Quero modernizar minha operação",
];

export function ChatWindow({
  messages,
  isSending,
  error,
  onSend,
}: ChatWindowProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(
    () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
    [messages, isSending],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;
    setDraft("");
    await onSend(message);
  }

  return (
    <section className="chat-panel" aria-label="Conversa com o assistente">
      <div className="chat-header">
        <div>
          <span className="live-dot" /> Assistente online
        </div>
        <span className="chat-label">CONSULTA GUIADA</span>
      </div>
      <div className="messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="welcome">
            <span className="welcome-index">A</span>
            <p className="kicker">Vamos começar</p>
            <h3>Qual é a necessidade da sua empresa?</h3>
            <p>
              Conte em poucas palavras o que você pretende financiar. Quanto
              mais contexto, melhor a orientação.
            </p>
            <div className="suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void onSend(suggestion)}
                >
                  {suggestion}
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <MessageBubble key={`${message.role}-${index}`} message={message} />
        ))}
        {isSending && (
          <div className="typing" aria-label="Assistente digitando">
            <span />
            <span />
            <span /> Consultando informações oficiais
          </div>
        )}
        {error && (
          <div className="error-message" role="alert">
            <strong>Não foi possível concluir.</strong>
            <span>{error}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Descreva o que sua empresa precisa..."
          rows={1}
          disabled={isSending}
          aria-label="Mensagem"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit(event);
            }
          }}
        />
        <button
          className="send-button"
          type="submit"
          disabled={!draft.trim() || isSending}
          aria-label="Enviar mensagem"
        >
          ↑
        </button>
        <span className="composer-hint">
          Enter para enviar · Shift + Enter para nova linha
        </span>
      </form>
    </section>
  );
}
