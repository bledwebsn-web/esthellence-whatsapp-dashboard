"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ConversationMessage = {
  id: string;
  conversation_id?: string;
  direction: "inbound" | "outbound" | string;
  message_type: string;
  sender_type: string | null;
  source_label: string | null;
  delivery_status: string | null;
  read_at: string | null;
  delivered_at: string | null;
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

function formatClock(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
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

function messagesFingerprint(messages: ConversationMessage[]) {
  return messages
    .map(
      (message) =>
        [
          message.id,
          message.status ?? "",
          message.delivery_status ?? "",
          message.read_at ?? "",
          message.delivered_at ?? "",
          message.content ?? "",
        ].join("|")
    )
    .join("::");
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isInbound = message.direction === "inbound";
  const isAiMessage = resolveMessageParty(message) === "ai";
  const whatsappStatus = getEffectiveDeliveryStatus(message);

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
          isInbound
            ? "bg-slate-800 text-slate-100"
            : "bg-cyan-500 text-slate-950"
        }`}
      >
        <div className="whitespace-pre-wrap text-[15px] leading-6">
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

type ConversationMessagesProps = {
  conversationId: string;
  initialMessages: ConversationMessage[];
};

export default function ConversationMessages({
  conversationId,
  initialMessages,
}: ConversationMessagesProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState<"live" | "syncing" | "error">("live");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const latestFingerprintRef = useRef(messagesFingerprint(initialMessages));
  const initialScrollDoneRef = useRef(false);
  const latestServerTimeRef = useRef<string | null>(null);

  const liveLabel = useMemo(() => {
    if (status === "error") {
      return "Reconnexion…";
    }

    if (lastUpdatedAt) {
      return `Actualisé à ${formatClock(lastUpdatedAt)}`;
    }

    return "Live";
  }, [lastUpdatedAt, status]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function isAtBottom() {
    const container = containerRef.current;
    if (!container) {
      return true;
    }

    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distance < 120;
  }

  function updateMessages(nextMessages: ConversationMessage[]) {
    const nextFingerprint = messagesFingerprint(nextMessages);
    if (nextFingerprint === latestFingerprintRef.current) {
      return false;
    }

    latestFingerprintRef.current = nextFingerprint;
    setMessages(nextMessages);
    return true;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      scrollToBottom("auto");
      initialScrollDoneRef.current = true;
    }, 50);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    function handleScroll() {
      isNearBottomRef.current = isAtBottom();
      if (isNearBottomRef.current) {
        setHasNewMessages(false);
      }
    }

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshMessages() {
      try {
        setStatus((current) => (current === "error" ? "syncing" : current));

        const response = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (!response.ok || !data.success || !Array.isArray(data.messages)) {
          throw new Error(data.error || "Failed to load messages");
        }

        if (cancelled) {
          return;
        }

        const updated = updateMessages(data.messages);
        latestServerTimeRef.current = data.server_time ?? null;
        setLastUpdatedAt(new Date());
        setStatus("live");

        if (updated) {
          if (isNearBottomRef.current) {
            scrollToBottom("auto");
          } else {
            setHasNewMessages(true);
          }
        }
      } catch {
        if (cancelled) {
          return;
        }

        setStatus("error");
      }
    }

    void refreshMessages();
    const interval = window.setInterval(() => {
      void refreshMessages();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [conversationId]);

  return (
    <div className="relative h-full overflow-hidden">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-8 py-6 pr-6 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]"
      >
        <div className="mb-4 flex items-center justify-between text-[11px] text-slate-500">
          <span>{liveLabel}</span>
          {latestServerTimeRef.current ? (
            <span>Serveur {new Date(latestServerTimeRef.current).toLocaleTimeString("fr-FR")}</span>
          ) : null}
        </div>

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

      {hasNewMessages && !isNearBottomRef.current ? (
        <button
          type="button"
          onClick={() => {
            scrollToBottom("smooth");
            setHasNewMessages(false);
          }}
          className="absolute bottom-4 right-4 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs font-medium text-slate-200 shadow-lg shadow-black/20 backdrop-blur transition hover:bg-slate-900"
        >
          Nouveau message ↓
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            scrollToBottom("smooth");
            setHasNewMessages(false);
          }}
          className="absolute bottom-4 right-4 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs font-medium text-slate-200 shadow-lg shadow-black/20 backdrop-blur transition hover:bg-slate-900"
        >
          Dernier message ↓
        </button>
      )}

      {status === "error" ? (
        <div className="absolute left-4 bottom-4 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] text-amber-100">
          Dernière mise à jour échouée
        </div>
      ) : null}
    </div>
  );
}
