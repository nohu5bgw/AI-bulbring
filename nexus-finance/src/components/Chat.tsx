"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble, { Message } from "./MessageBubble";
import CommandInput from "./CommandInput";

const STORAGE_KEY = "nexus-chat";

const WELCOME: Message = {
  role: "assistant",
  content:
    "NEXUS online. Portfolio, budget, and goals loaded.\n\nTry **morning briefing**, **how's my portfolio?**, or **log expense: $45 groceries**. Type `clear` to wipe the session.",
};

export default function Chat({ onDataChanged }: { onDataChanged: () => void }) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // Persist chat across refreshes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
    } catch {}
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    if (text.toLowerCase() === "clear") {
      setMessages([WELCOME]);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return;
    }

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: "assistant", content: "", toolEvents: [] }]);
    setBusy(true);

    let usedTools = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Send trimmed history; the welcome message is UI-only
          messages: nextMessages
            .filter((m) => m !== WELCOME)
            .slice(-24)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const applyEvent = (evt: any) => {
        if (evt.type === "text") {
          setMessages((prev) => {
            const copy = [...prev];
            const last = { ...copy[copy.length - 1] };
            last.content += evt.text;
            copy[copy.length - 1] = last;
            return copy;
          });
        } else if (evt.type === "tool") {
          usedTools = true;
          setMessages((prev) => {
            const copy = [...prev];
            const last = { ...copy[copy.length - 1] };
            last.toolEvents = [...(last.toolEvents ?? []), evt.name];
            copy[copy.length - 1] = last;
            return copy;
          });
        } else if (evt.type === "error") {
          setMessages((prev) => {
            const copy = [...prev];
            const last = { ...copy[copy.length - 1] };
            last.content += `\n\n**Error:** ${evt.error}`;
            copy[copy.length - 1] = last;
            return copy;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            applyEvent(JSON.parse(line));
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        const last = { ...copy[copy.length - 1] };
        last.content += `\n\n**Error:** ${err instanceof Error ? err.message : "request failed"}`;
        copy[copy.length - 1] = last;
        return copy;
      });
    } finally {
      setBusy(false);
      if (usedTools) onDataChanged();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              streaming={busy && i === messages.length - 1 && m.role === "assistant"}
            />
          ))}
        </div>
      </div>
      <CommandInput onSubmit={send} disabled={busy} />
    </div>
  );
}
