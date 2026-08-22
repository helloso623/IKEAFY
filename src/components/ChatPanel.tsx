"use client";

import { useRef, useState } from "react";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  text: string;
  model?: string;
  escalated?: boolean;
  isError?: boolean;
}

interface ChatApiResponse {
  answer: string;
  escalated: boolean;
  model: string;
}

const GREETING: ChatMessage = {
  role: "assistant",
  text: "Hi! Ask me anything about this build — tools, parts, a specific step, or what to do if something's broken.",
};

export function ChatPanel({ planId }: { planId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  };

  const sendQuestion = async () => {
    const question = input.trim();
    if (question.length === 0 || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setIsLoading(true);
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

      const data: ChatApiResponse = await response.json();

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
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry, I couldn't reach the assistant. Please try again.",
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      requestAnimationFrame(scrollToBottom);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendQuestion();
  };

  return (
    <section
      className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm"
      style={{ borderTopColor: "var(--ikeafy-blue)", borderTopWidth: 3 }}
    >
      <header className="border-b border-black/5 px-4 py-3">
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--ikeafy-blue)" }}
        >
          Ask about this build
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Tools, parts, a specific step, or troubleshooting.
        </p>
      </header>

      <div
        ref={scrollRef}
        className="flex max-h-72 min-h-40 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <div
              key={index}
              className={`flex flex-col ${
                isUser ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  isUser
                    ? "rounded-br-sm text-white"
                    : message.isError
                      ? "rounded-bl-sm bg-red-50 text-red-700"
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
                  via {message.model}
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

        {isLoading ? (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-500">
              typing…
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-black/5 px-3 py-3"
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={isLoading}
          placeholder="Ask a question…"
          aria-label="Ask a question about this build"
          className="min-w-0 flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30 disabled:bg-neutral-50 disabled:text-neutral-400"
        />
        <button
          type="submit"
          disabled={isLoading || input.trim().length === 0}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "var(--ikeafy-blue)" }}
        >
          Send
        </button>
      </form>
    </section>
  );
}
