"use client";

import { useRef, useState } from "react";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  text: string;
  model?: string;
  escalated?: boolean;
}

interface ChatResponse {
  answer: string;
  escalated: boolean;
  model: string;
}

const SUGGESTIONS = [
  "What tools do I need?",
  "Which parts do I need to buy?",
  "What if a part is missing?",
  "Summarize step 2",
];

export function ChatPanel({ planId }: { planId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  };

  const send = async () => {
    const question = input.trim();
    if (question.length === 0 || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setError(null);
    setLoading(true);
    requestAnimationFrame(scrollToBottom);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, question }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data: ChatResponse = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          model: data.model,
          escalated: data.escalated,
        },
      ]);
    } catch {
      setError("Sorry, something went wrong. Please try again.");
    } finally {
      setLoading(false);
      requestAnimationFrame(scrollToBottom);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send();
  };

  return (
    <section
      className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm"
      style={{ borderTopColor: "var(--ikeafy-blue)", borderTopWidth: 3 }}
      aria-label="Quick question chat"
    >
      <header className="border-b border-black/5 px-4 py-3">
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--ikeafy-blue)" }}
        >
          Ask a quick question
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Gliner 2 handles quick Qs; complex ones escalate to OpenAI.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5 border-b border-black/5 px-4 py-3">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setInput(suggestion)}
            disabled={loading}
            className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:border-black/20 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-72 min-h-40 flex-col gap-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {messages.length === 0 && !loading ? (
          <p className="my-auto text-center text-xs text-neutral-400">
            Tap a suggestion or type a question to get started.
          </p>
        ) : null}

        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <div
              key={index}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  isUser
                    ? "rounded-br-sm text-white"
                    : "rounded-bl-sm bg-neutral-100 text-neutral-800"
                }`}
                style={
                  isUser ? { backgroundColor: "var(--ikeafy-blue)" } : undefined
                }
              >
                {message.text}
              </div>
              {!isUser && message.model ? (
                <span className="mt-1 flex items-center gap-1 px-1 text-[10px] text-neutral-400">
                  {message.model}
                  {message.escalated ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-black/70"
                      style={{ backgroundColor: "var(--ikeafy-yellow)" }}
                    >
                      escalated
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          );
        })}

        {loading ? (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-500">
              …
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-black/5 px-3 py-3"
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={loading}
          placeholder="Ask a quick question…"
          aria-label="Ask a quick question about this build"
          className="min-w-0 flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 disabled:bg-neutral-50 disabled:text-neutral-400"
        />
        <button
          type="submit"
          disabled={loading || input.trim().length === 0}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "var(--ikeafy-blue)" }}
        >
          Send
        </button>
      </form>
    </section>
  );
}
