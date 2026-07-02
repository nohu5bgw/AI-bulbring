"use client";

import { useEffect, useRef, useState, KeyboardEvent } from "react";

interface Props {
  onSubmit: (text: string) => void;
  disabled: boolean;
}

export default function CommandInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const draftRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Ctrl+K focuses the input
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nexus-cmd-history");
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    const next = [text, ...history.filter((h) => h !== text)].slice(0, 50);
    setHistory(next);
    try {
      localStorage.setItem("nexus-cmd-history", JSON.stringify(next));
    } catch {}
    setHistoryIdx(-1);
    setValue("");
    onSubmit(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      if (historyIdx === -1) draftRef.current = value;
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setValue(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx <= 0) {
        setHistoryIdx(-1);
        setValue(draftRef.current);
        draftRef.current = "";
        return;
      }
      const idx = historyIdx - 1;
      setHistoryIdx(idx);
      setValue(history[idx]);
    }
  };

  return (
    <div className="border-t border-edge bg-panel px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <span className="font-mono text-accent">❯</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setHistoryIdx(-1);
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={disabled ? "NEXUS is working..." : 'Try "morning briefing" or "how\'s my portfolio?"'}
          className="flex-1 bg-transparent font-mono text-sm text-ink placeholder-muted outline-none disabled:opacity-50"
          autoFocus
          spellCheck={false}
        />
        <kbd className="hidden border border-edge px-1.5 py-0.5 font-mono text-[10px] text-muted sm:block">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
