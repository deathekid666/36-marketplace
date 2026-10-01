"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type InboxMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  pending?: boolean;
};

export type InboxThread = {
  bookingId: string;
  counterpartName: string;
  studioName: string;
  studioSlug: string;
  roomName: string;
  startAt: string;
  endAt: string;
  status: string;
  totalAmountMad: number;
  photoUrl: string | null;
  lastMessage: string;
  lastMessageAt: string | null;
  needsReply: boolean;
};

function shortDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dayLabel(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function timeLabel(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function MessagingInbox({
  userId,
  role,
  threads,
  initialBookingId,
  initialMessages,
}: {
  userId: string;
  role: "CREATOR" | "STUDIO_OWNER";
  threads: InboxThread[];
  initialBookingId: string | null;
  initialMessages: InboxMessage[];
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(initialBookingId);
  const [messages, setMessages] = useState<InboxMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileThread, setMobileThread] = useState(Boolean(initialBookingId));
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const active = threads.find((thread) => thread.bookingId === activeId) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((thread) =>
      [
        thread.counterpartName,
        thread.studioName,
        thread.roomName,
        thread.lastMessage,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, threads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, activeId]);

  useEffect(() => {
    if (!activeId) return;

    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/messages/" + activeId, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch {
        // Keep current conversation visible if polling fails.
      }
    }

    const timer = window.setInterval(refresh, 4500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeId]);

  async function openThread(bookingId: string) {
    setActiveId(bookingId);
    setMobileThread(true);
    setError("");
    setMessages([]);

    const params = new URLSearchParams(window.location.search);
    params.set("booking", bookingId);
    window.history.replaceState(null, "", "/messages?" + params.toString());

    try {
      const response = await fetch("/api/messages/" + bookingId, {
        cache: "no-store",
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch {
      setError("Could not load this conversation.");
    }
  }

  async function send() {
    if (!activeId || !body.trim() || sending) return;

    const text = body.trim();
    const tempId = "pending-" + Date.now();
    const optimistic: InboxMessage = {
      id: tempId,
      senderId: userId,
      senderName: "You",
      body: text,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((current) => [...current, optimistic]);
    setBody("");
    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/messages/" + activeId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.message) {
        setMessages((current) =>
          current.filter((message) => message.id !== tempId),
        );
        setBody(text);
        setError("Message was not sent. Try again.");
        return;
      }

      setMessages((current) => [
        ...current.filter((message) => message.id !== tempId),
        data.message,
      ]);
      router.refresh();
    } catch {
      setMessages((current) =>
        current.filter((message) => message.id !== tempId),
      );
      setBody(text);
      setError("Message was not sent. Check your connection.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-[#11120f] shadow-[0_24px_90px_rgba(0,0,0,.42)]">
      <div className="grid min-h-[720px] lg:grid-cols-[360px_1fr]">
        <aside
          className={
            "border-r border-zinc-900 bg-black/15 " +
            (mobileThread ? "hidden lg:block" : "block")
          }
        >
          <div className="border-b border-zinc-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-acid">
                  Inbox
                </span>
                <h1 className="mt-1 text-2xl font-black">Messages</h1>
              </div>
              <span className="rounded-full border border-zinc-800 px-3 py-1 text-[10px] font-black text-zinc-500">
                {threads.length}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3">
              <span className="text-zinc-700">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search messages"
                className="w-full bg-transparent py-3 text-xs text-white outline-none placeholder:text-zinc-700"
              />
            </div>
          </div>

          <div className="max-h-[645px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-600">
                No conversations found.
              </div>
            ) : (
              filtered.map((thread) => {
                const selected = thread.bookingId === activeId;
                return (
                  <button
                    key={thread.bookingId}
                    type="button"
                    onClick={() => openThread(thread.bookingId)}
                    className={
                      "flex w-full gap-3 border-b border-zinc-900 p-4 text-left transition " +
                      (selected
                        ? "bg-white/[0.05]"
                        : "hover:bg-white/[0.025]")
                    }
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-900">
                      {thread.photoUrl ? (
                        <img
                          src={thread.photoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-sm font-black text-acid">
                          36
                        </div>
                      )}
                      {thread.needsReply && (
                        <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-acid ring-2 ring-[#11120f]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <b className="truncate text-sm">
                          {thread.counterpartName}
                        </b>
                        <span className="shrink-0 text-[9px] text-zinc-700">
                          {thread.lastMessageAt
                            ? shortDate(thread.lastMessageAt)
                            : dayLabel(thread.startAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] font-bold text-zinc-500">
                        {thread.studioName}
                      </p>
                      <p
                        className={
                          "mt-1 truncate text-xs " +
                          (thread.needsReply
                            ? "font-semibold text-zinc-300"
                            : "text-zinc-600")
                        }
                      >
                        {thread.lastMessage || "Start the conversation"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section
          className={
            "min-w-0 " +
            (!mobileThread ? "hidden lg:flex" : "flex") +
            " flex-col"
          }
        >
          {!active ? (
            <div className="grid flex-1 place-items-center p-10 text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-zinc-800 bg-zinc-950 text-2xl">
                  💬
                </div>
                <h2 className="mt-5 text-2xl font-black">
                  Your 36 conversations
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-600">
                  Choose a booking conversation to message the studio or creator.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-900 bg-[#11120f]/95 p-4 sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileThread(false)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-800 text-zinc-400 lg:hidden"
                    aria-label="Back to conversations"
                  >
                    ←
                  </button>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-acid text-xs font-black text-black">
                    {initials(active.counterpartName) || "36"}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-black">
                      {active.counterpartName}
                    </h2>
                    <p className="truncate text-[10px] text-zinc-600">
                      {active.studioName} · {active.roomName}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={"/studios/" + active.studioSlug}
                    className="rounded-full border border-zinc-800 px-3 py-2 text-[10px] font-black text-zinc-400 hover:text-white"
                  >
                    Studio
                  </Link>
                  <Link
                    href={
                      role === "CREATOR"
                        ? "/creator/bookings/" + active.bookingId
                        : "/owner/bookings/" + active.bookingId
                    }
                    className="rounded-full border border-zinc-800 px-3 py-2 text-[10px] font-black text-zinc-400 hover:text-white"
                  >
                    Booking
                  </Link>
                </div>
              </header>

              <div className="border-b border-zinc-900 bg-black/10 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px]">
                  <span className="font-black text-acid">
                    {active.status.replaceAll("_", " ")}
                  </span>
                  <span className="text-zinc-500">
                    {dayLabel(active.startAt)} · {timeLabel(active.startAt)}–{timeLabel(active.endAt)}
                  </span>
                  <span className="text-zinc-500">
                    {active.totalAmountMad} MAD
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,.025),transparent_42%)] px-4 py-6 sm:px-7">
                <div className="mx-auto max-w-3xl space-y-3">
                  {messages.length === 0 ? (
                    <div className="py-20 text-center">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-zinc-900 text-lg">
                        👋
                      </div>
                      <b className="mt-4 block text-sm">
                        Start the conversation
                      </b>
                      <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-600">
                        Use this thread for arrival details, equipment questions and session coordination.
                      </p>
                    </div>
                  ) : (
                    messages.map((message, index) => {
                      const mine = message.senderId === userId;
                      const previous = messages[index - 1];
                      const showName =
                        !previous || previous.senderId !== message.senderId;

                      return (
                        <div
                          key={message.id}
                          className={
                            "flex " +
                            (mine ? "justify-end" : "justify-start")
                          }
                        >
                          <div className="max-w-[82%] sm:max-w-[68%]">
                            {showName && !mine && (
                              <span className="mb-1 block px-1 text-[9px] font-bold text-zinc-600">
                                {message.senderName}
                              </span>
                            )}
                            <div
                              className={
                                "rounded-[1.25rem] px-4 py-3 text-sm leading-6 " +
                                (mine
                                  ? "rounded-br-md bg-acid text-black"
                                  : "rounded-bl-md border border-zinc-800 bg-zinc-900 text-zinc-200") +
                                (message.pending ? " opacity-60" : "")
                              }
                            >
                              <p className="whitespace-pre-wrap break-words">
                                {message.body}
                              </p>
                            </div>
                            <span
                              className={
                                "mt-1 block px-1 text-[9px] text-zinc-700 " +
                                (mine ? "text-right" : "text-left")
                              }
                            >
                              {timeLabel(message.createdAt)}
                              {message.pending ? " · Sending…" : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>
              </div>

              <footer className="border-t border-zinc-900 bg-[#11120f] p-3 sm:p-4">
                <div className="mx-auto max-w-3xl">
                  {error && (
                    <p className="mb-2 text-xs text-red-300">{error}</p>
                  )}
                  <div className="flex items-end gap-2 rounded-[1.35rem] border border-zinc-800 bg-zinc-950 p-2 focus-within:border-zinc-600">
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      maxLength={2000}
                      placeholder={
                        role === "CREATOR"
                          ? "Message the studio…"
                          : "Message the creator…"
                      }
                      className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={send}
                      disabled={!body.trim() || sending}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-acid text-lg font-black text-black transition disabled:bg-zinc-800 disabled:text-zinc-600"
                      aria-label="Send message"
                    >
                      ↑
                    </button>
                  </div>
                  <p className="mt-2 px-2 text-[9px] text-zinc-700">
                    Enter to send · Shift + Enter for a new line
                  </p>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
