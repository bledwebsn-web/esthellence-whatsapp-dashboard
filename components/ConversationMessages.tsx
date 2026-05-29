"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GlassIconButton from "@/components/GlassIconButton";
import { WABASSIST_BADGE_SRC } from "@/components/ManualReplyForm";

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
  media_id?: string | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  media_filename?: string | null;
  media_size?: number | null;
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

  if (sourceLabel === "WABAssist") return "ai";
  if (senderType === "ai" || senderType === "human" || senderType === "lead") {
    return senderType;
  }
  if (message.direction === "inbound") return "lead";
  return "human";
}

function getEffectiveDeliveryStatus(message: ConversationMessage) {
  if (message.read_at) return "read";
  return message.delivery_status || message.status || "sent";
}

function getWhatsappTickLabel(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized === "delivered" || normalized === "read") return "✓✓";
  if (normalized === "failed") return "échec";
  return "✓";
}

function getWhatsappTickClass(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized === "read") {
    return "ml-1 rounded-full bg-[var(--app-panel-soft)] px-1 text-[11px] font-semibold text-[var(--app-tick-read)]";
  }

  if (normalized === "failed") {
    return "ml-1 rounded-full bg-[var(--app-panel-soft)] px-1 text-[11px] font-semibold text-[var(--app-tick-failed)]";
  }

  if (normalized === "delivered") {
    return "ml-1 rounded-full bg-[var(--app-panel-soft)] px-1 text-[11px] text-[var(--app-tick-delivered)]";
  }

  return "ml-1 rounded-full bg-[var(--app-panel-soft)] px-1 text-[11px] text-[var(--app-tick-sent)]";
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
          message.media_id ?? "",
          message.media_url ?? "",
          message.media_mime_type ?? "",
          message.media_filename ?? "",
          message.media_size ?? "",
        ].join("|")
    )
    .join("::");
}

function isFallbackMediaLabel(content: string | null | undefined, messageType: string) {
  const normalized = (content ?? "").trim().toLowerCase();
  const fallbackLabels = [
    `[${messageType}]`,
    "[image]",
    "[audio]",
    "[document]",
    "[video]",
    "[sticker]",
  ];

  return fallbackLabels.includes(normalized);
}

function MediaContent({ message }: { message: ConversationMessage }) {
  const mediaUrl = message.media_url ?? "";
  const messageType = (message.message_type ?? "").toLowerCase();
  const content = message.content ?? "";
  const hasCaption = Boolean(content.trim()) && !isFallbackMediaLabel(content, messageType);

  if (messageType === "image" || messageType === "sticker") {
    if (mediaUrl) {
      return (
        <div className="space-y-2">
            <a href={mediaUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl">
              <img
                src={mediaUrl}
                alt={message.media_filename ?? "Image WhatsApp"}
                className={`w-full object-contain ${
                  messageType === "sticker"
                    ? "max-h-[180px] sm:max-h-[200px]"
                    : "max-h-[300px] sm:max-h-[360px]"
                }`}
                loading="lazy"
              />
            </a>
          {hasCaption ? (
            <div className="whitespace-pre-wrap text-sm leading-6">{content}</div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] px-4 py-4 text-sm text-[var(--app-muted)]">
          {messageType === "sticker"
            ? "Sticker reçu — média indisponible"
            : "Image reçue — média indisponible"}
        </div>
        {hasCaption ? <div className="whitespace-pre-wrap text-sm leading-6">{content}</div> : null}
      </div>
    );
  }

  if (messageType === "audio") {
    if (mediaUrl) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-black/5 text-current/80">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-4.5 w-4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <path d="M12 18v3" />
              </svg>
            </span>
            <div>
              <div className="font-medium">Message vocal</div>
              <div className="text-[12px] opacity-80">Audio WhatsApp</div>
            </div>
          </div>
          <audio controls preload="none" src={mediaUrl} className="w-full" />
          {hasCaption ? <div className="whitespace-pre-wrap text-sm leading-6">{content}</div> : null}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] px-4 py-4 text-sm text-[var(--app-muted)]">
          Message vocal — média indisponible
        </div>
        {hasCaption ? <div className="whitespace-pre-wrap text-sm leading-6">{content}</div> : null}
      </div>
    );
  }

  if (messageType === "document") {
    if (mediaUrl) {
      return (
        <div className="space-y-2">
          <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-white/70 text-[var(--app-fg)]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-5 w-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                  <path d="M14 2v5h5" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{message.media_filename ?? "Document"}</div>
                <div className="text-[12px] text-[var(--app-muted)]">
                  {message.media_mime_type ?? "application/octet-stream"}
                </div>
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center rounded-full border border-[color:var(--app-border)] px-3 py-1 text-xs font-medium"
                >
                  Télécharger
                </a>
              </div>
            </div>
          </div>
          {hasCaption ? <div className="whitespace-pre-wrap text-sm leading-6">{content}</div> : null}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] px-4 py-4 text-sm text-[var(--app-muted)]">
          Document reçu — média indisponible
        </div>
        {hasCaption ? <div className="whitespace-pre-wrap text-sm leading-6">{content}</div> : null}
      </div>
    );
  }

  if (messageType === "video") {
    if (mediaUrl) {
      return (
        <div className="space-y-2">
          <video
            controls
            src={mediaUrl}
            className="max-h-[300px] w-full rounded-2xl object-contain sm:max-h-[360px]"
          />
          {hasCaption ? <div className="whitespace-pre-wrap text-sm leading-6">{content}</div> : null}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] px-4 py-4 text-sm text-[var(--app-muted)]">
          Vidéo reçue — média indisponible
        </div>
        {hasCaption ? <div className="whitespace-pre-wrap text-sm leading-6">{content}</div> : null}
      </div>
    );
  }

  return <div className="whitespace-pre-wrap text-sm leading-6 sm:text-[15px]">{content || "Message sans contenu"}</div>;
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isInbound = message.direction === "inbound";
  const isAiMessage = resolveMessageParty(message) === "ai";
  const whatsappStatus = getEffectiveDeliveryStatus(message);

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`min-w-0 max-w-[88%] rounded-3xl border p-4 shadow-[0_10px_30px_rgba(0,0,0,0.12)] sm:max-w-[78%] lg:max-w-[72%] ${
          isInbound
            ? "border-[color:var(--app-inbound-border)] bg-[var(--app-inbound-bg)] text-[var(--app-fg)]"
            : isAiMessage
              ? "border-[color:var(--app-accent-border)] bg-gradient-to-br from-cyan-300 via-cyan-400 to-cyan-500 text-[var(--app-outbound-text)]"
              : "border-[color:var(--app-accent-border)] bg-[var(--app-outbound-bg)] text-[var(--app-outbound-text)]"
        }`}
      >
        <MediaContent message={message} />

        <div
          className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] ${
            isInbound
              ? "justify-start text-[var(--app-muted)]"
              : "justify-end text-slate-700/90 dark:text-cyan-950/80"
          }`}
        >
          {isInbound ? (
            <span>{formatDateTime(message.created_at)}</span>
          ) : (
            <>
              {isAiMessage ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--app-border)] bg-[var(--app-badge-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--app-badge-text)]">
                  <img
                    src={WABASSIST_BADGE_SRC}
                    alt="WABAssist"
                    className="h-3.5 w-3.5 rounded-full object-cover"
                  />
                  <span>WABAssist</span>
                </span>
              ) : null}
              <span className="text-slate-700/90 dark:text-cyan-950/80">
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
  const [isBottomVisible, setIsBottomVisible] = useState(true);
  const [latestServerTime, setLatestServerTime] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isBottomVisibleRef = useRef(true);
  const latestFingerprintRef = useRef(messagesFingerprint(initialMessages));
  const previousMessagesRef = useRef(initialMessages);
  const firstLoadRef = useRef(true);

  const liveLabel = useMemo(() => {
    if (status === "error") return "Reconnexion…";
    if (lastUpdatedAt) return `Actualisé à ${formatClock(lastUpdatedAt)}`;
    return "Live";
  }, [lastUpdatedAt, status]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const run = () => {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    };

    requestAnimationFrame(run);
    window.setTimeout(run, 50);
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
    isBottomVisibleRef.current = isBottomVisible;
    if (isBottomVisible) {
      setHasNewMessages(false);
    }
  }, [isBottomVisible]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      scrollToBottom("auto");
      firstLoadRef.current = false;
    }, 50);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const bottom = bottomRef.current;

    if (!container || !bottom || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = Boolean(entry?.isIntersecting && entry.intersectionRatio > 0.95);
        setIsBottomVisible(visible);
      },
      {
        root: container,
        threshold: [0.95, 1],
      }
    );

    observer.observe(bottom);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshMessages() {
      try {
        setStatus((current) => (current === "error" ? "syncing" : current));

        const response = await fetch(`/api/conversations/${conversationId}/messages`, {
          cache: "no-store",
        });

        const data: {
          success?: boolean;
          messages?: ConversationMessage[];
          server_time?: string;
          error?: string;
        } = await response.json();

        if (!response.ok || !data.success || !Array.isArray(data.messages)) {
          throw new Error(data.error || "Failed to load messages");
        }

        if (cancelled) return;

        const nextMessages: ConversationMessage[] = data.messages;
        const previousMessages = previousMessagesRef.current;
        const previousFingerprint = latestFingerprintRef.current;
        const nextFingerprint = messagesFingerprint(nextMessages);
        const hasChanged = nextFingerprint !== previousFingerprint;
        const updated = updateMessages(nextMessages);
        previousMessagesRef.current = nextMessages;
        setLatestServerTime(data.server_time ?? null);
        setLastUpdatedAt(new Date());
        setStatus("live");

        if (updated || hasChanged) {
          const previousCount = previousMessages.length;
          const nextCount = nextMessages.length;
          const newestMessage = nextMessages[nextMessages.length - 1];
          const newestIsNewInbound =
            nextCount > previousCount && newestMessage?.direction === "inbound";

          const shouldAutoScroll =
            firstLoadRef.current ||
            isBottomVisibleRef.current ||
            newestIsNewInbound;

          firstLoadRef.current = false;

          if (shouldAutoScroll) {
            scrollToBottom("smooth");
            setHasNewMessages(false);
          } else if (nextCount > previousCount) {
            setHasNewMessages(true);
          }
        }
      } catch {
        if (cancelled) return;
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
    <div className="relative h-full min-h-0 overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]"
      >
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 pb-52 sm:pb-44">
          <div className="flex items-center justify-between text-[11px] text-[var(--app-muted)]">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]" />
              {liveLabel}
            </span>
            {latestServerTime ? (
              <span>Serveur {new Date(latestServerTime).toLocaleTimeString("fr-FR")}</span>
            ) : null}
          </div>

          <div className="space-y-4 sm:space-y-5">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
                Aucun message dans cette conversation.
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))
            )}
            <div id="messages-bottom" ref={bottomRef} className="h-36 sm:h-32" />
          </div>
        </div>
      </div>

      {!isBottomVisible ? (
      <GlassIconButton
        onClick={() => {
          scrollToBottom("smooth");
          setHasNewMessages(false);
        }}
        src="/icons/actions/button-last-message.png"
        alt="Dernier message"
        ariaLabel="Aller au dernier message"
        title="Dernier message"
        className="absolute bottom-36 left-1/2 z-20 h-12 w-12 -translate-x-1/2 sm:bottom-28"
      >
        {hasNewMessages ? (
          <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
        ) : null}
      </GlassIconButton>
      ) : null}

      {status === "error" ? (
        <div className="absolute bottom-24 left-4 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] text-amber-100 sm:bottom-20">
          Dernière mise à jour échouée
        </div>
      ) : null}
    </div>
  );
}
