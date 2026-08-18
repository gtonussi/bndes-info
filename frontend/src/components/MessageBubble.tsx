import type { ChatMessage } from "./ChatWindow";

export function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <article className={`message ${message.role}`}>
      <div className="message-meta">
        {message.role === "assistant" ? "BNDES INFO" : "VOCÊ"}
      </div>
      <div className="message-content">{message.content}</div>
      {message.citations && message.citations.length > 0 && (
        <div className="citations">
          <span>FONTES CONSULTADAS</span>
          {message.citations.map((citation) => (
            <a
              key={citation.url}
              href={citation.url}
              target="_blank"
              rel="noreferrer"
            >
              BNDES · {citation.date} ↗
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
