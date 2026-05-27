"use client";

import { useEffect, useMemo, useRef } from "react";

type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound" | string;
  message_type: string;
  sender_type: string | null;
  source_label: string | null;
  delivery_status: string | null;
  read_at: string | null;
  content: string | null;
  whatsapp_message_id: string | null;
  status: string | null;
  created_at: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function resolveMessageParty(message: ConversationMessage) {
  const sourceLabel = (message.source_label ?? "").trim();
  const senderType = (message.sender_type ?? "").trim().toLowerCase();

  if (sourceLabel === "WABAssist") {
    return "ai";
  }

  if (senderType === "ai" || senderType === "human" || senderType === "lead") {
    return senderType;
  }

  if (message.direction === "inbound") {
    return "lead";
  }

  return "human";
}

function getEffectiveDeliveryStatus(message: ConversationMessage) {
  if (message.read_at) {
    return "read";
  }

  return message.delivery_status || message.status || "sent";
}

function getWhatsappTickLabel(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized === "delivered" || normalized === "read") {
    return "✓✓";
  }

  if (normalized === "failed") {
    return "échec";
  }

  return "✓";
}

function getWhatsappTickClass(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized === "read") {
    return "ml-1 rounded-full bg-white/30 px-1 text-xs text-blue-900 font-semibold";
  }

  if (normalized === "failed") {
    return "ml-1 rounded-full bg-white/30 px-1 text-xs text-red-700 font-semibold";
  }

  if (normalized === "delivered") {
    return "ml-1 rounded-full bg-white/30 px-1 text-xs text-slate-700";
  }

  return "ml-1 rounded-full bg-white/30 px-1 text-xs text-slate-600";
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isInbound = message.direction === "inbound";
  const isAiMessage = resolveMessageParty(message) === "ai";
  const whatsappStatus = getEffectiveDeliveryStatus(message);

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-lg ${
          isInbound
            ? "bg-slate-800 text-slate-100"
            : "bg-cyan-500 text-slate-950"
        }`}
      >
        <div className="whitespace-pre-wrap text-sm leading-6">
          {message.content || "Message sans contenu"}
        </div>
        <div
          className={`mt-1.5 flex items-center justify-end gap-1.5 text-[11px] ${
            isInbound ? "text-slate-400" : "text-cyan-950/70"
          }`}
        >
          {isInbound ? (
            <span>{formatDateTime(message.created_at)}</span>
          ) : (
            <>
              {isAiMessage ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-slate-100">
                  <img
                    src="/wabassist-badge.png"
                    alt="WABAssist"
                    className="h-3.5 w-3.5 rounded-full"
                  />
                  <span>WABAssist</span>
                </span>
              ) : null}
              <span className="text-slate-700/90">
                {formatDateTime(message.created_at)}
              </span>
              <span className={getWhatsappTickClass(whatsappStatus)}>
                {getWhatsappTickLabel(whatsappStatus)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConversationMessages({
  messages,
}: {
  messages: ConversationMessage[];
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      containerRef.current?.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "auto",
      });
    });
  }, [messages]);

  const messageCountLabel = useMemo(() => `${messages.length} messages`, [messages.length]);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Historique des messages</h2>
        <button
          type="button"
          onClick={() =>
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
          }
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
        >
          Dernier message ↓
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-[calc(100vh-260px)] max-h-[70vh] overflow-y-auto pr-2"
      >
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">
              Aucun message dans cette conversation.
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
          <div id="messages-bottom" ref={bottomRef} />
        </div>
      </div>

      <div className="mt-3 text-right text-xs text-slate-500">{messageCountLabel}</div>
    </section>
  );
}
