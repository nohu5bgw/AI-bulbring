"use client";

import { useMemo } from "react";

/** Minimal markdown renderer: tables, bold, inline code, code fences, lists, headings. */
function renderMarkdown(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(esc(lines[i]));
        i++;
      }
      i++; // closing fence
      out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }

    // table
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const parseRow = (r: string) =>
        r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => inline(c.trim()));
      const header = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(parseRow(lines[i]));
        i++;
      }
      out.push(
        `<table><thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
      continue;
    }

    // heading
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level + 1}>${inline(h[2])}</h${level + 1}>`);
      i++;
      continue;
    }

    // lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph — swallow consecutive plain lines
    const buf: string[] = [inline(line)];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].includes("|") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("```")
    ) {
      buf.push(inline(lines[i]));
      i++;
    }
    out.push(`<p>${buf.join("<br/>")}</p>`);
  }

  return out.join("");
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  toolEvents?: string[];
}

export default function MessageBubble({ message, streaming }: { message: Message; streaming?: boolean }) {
  const html = useMemo(
    () => (message.role === "assistant" ? renderMarkdown(message.content) : ""),
    [message.content, message.role]
  );

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] border border-edge bg-raised px-3 py-2 text-sm font-mono text-ink">
          <span className="text-accent mr-2">❯</span>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <div className="max-w-[92%] text-sm leading-relaxed">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-accent">
          <span className="inline-block h-1.5 w-1.5 bg-accent" />
          NEXUS
          {message.toolEvents?.map((t, i) => (
            <span key={i} className="text-muted normal-case tracking-normal">
              · {t}
            </span>
          ))}
        </div>
        <div className="msg-body" dangerouslySetInnerHTML={{ __html: html }} />
        {streaming && <span className="cursor-blink inline-block h-4 w-2 bg-accent align-text-bottom" />}
      </div>
    </div>
  );
}
