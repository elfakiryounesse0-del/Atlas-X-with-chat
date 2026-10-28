import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, MessageCircle, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { PLACES } from "@/data/places";
import { spring } from "@/components/ui/primitives";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const KEY = "epoch-chat-v1";
const SUGGESTIONS = ["What is Epoch?", "What happened to the Aral Sea?", "How do I compare two dates?"];

function load(): Msg[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant")) : [];
  } catch {
    return [];
  }
}

function save(m: Msg[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m.slice(-40)));
  } catch {
    /* storage unavailable */
  }
}

/** Floating chat bubble: tap the circle to open the AI conversation panel. */
export function ChatWidget() {
  const welcomeSeen = useApp((s) => s.welcomeSeen);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => save(msgs), [msgs]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      const next: Msg[] = [...msgs, { role: "user", content }];
      setMsgs(next);
      setInput("");
      setError(null);
      setBusy(true);
      try {
        const s = useApp.getState();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next,
            context: { view: s.view, place: PLACES.find((p) => p.id === s.placeId)?.name },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.reply) throw new Error(data.error || "Request failed");
        setMsgs([...next, { role: "assistant", content: data.reply }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [msgs, busy]
  );

  // Stay hidden behind the splash / first-run welcome.
  if (!welcomeSeen) return null;

  return (
    <div className="fixed bottom-[calc(5.75rem+var(--safe-b))] right-4 z-[60] h-14 w-14 lg:bottom-6 lg:right-6">
      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="AI chat"
            initial={{ opacity: 0, scale: 0.9, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={spring}
            style={{ transformOrigin: "100% 100%" }}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className="glass-strong absolute bottom-full right-0 mb-3 flex h-[min(540px,calc(100dvh-11rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px]"
          >
            <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-ios-blue to-ios-indigo">
                <Sparkles size={17} className="text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight">Epoch Assistant</p>
                <p className="text-secondary text-[12px]">Ask about Earth&apos;s changes</p>
              </div>
              {msgs.length > 0 && (
                <button
                  aria-label="Clear conversation"
                  onClick={() => {
                    setMsgs([]);
                    setError(null);
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                aria-label="Close chat"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-4">
              {msgs.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="text-secondary max-w-[240px] text-[13px]">Hi! Ask me anything about the places, layers and timelines in Epoch.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] text-white/85 transition hover:bg-white/[0.14]"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <p
                    dir="auto"
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-[14px] leading-relaxed",
                      m.role === "user" ? "rounded-br-md bg-ios-blue text-white" : "rounded-bl-md bg-white/[0.09] text-white/90"
                    )}
                  >
                    {m.content}
                  </p>
                </div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <div className="flex gap-1 rounded-[20px] rounded-bl-md bg-white/[0.09] px-4 py-3" aria-label="Typing">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 animate-blink rounded-full bg-white/70" style={{ animationDelay: `${d * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-center text-[12px] text-ios-red">{error}</p>}
              <div ref={endRef} />
            </div>

            <div className="flex items-end gap-2 border-t border-white/10 p-3">
              <textarea
                ref={inputRef}
                dir="auto"
                rows={1}
                value={input}
                maxLength={2000}
                placeholder="Message…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-[20px] bg-white/[0.09] px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-white/35 focus:bg-white/[0.13]"
              />
              <button
                aria-label="Send"
                disabled={busy || !input.trim()}
                onClick={() => send(input)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ios-blue text-white transition enabled:hover:brightness-110 disabled:opacity-40"
              >
                <ArrowUp size={19} strokeWidth={2.5} />
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        aria-label={open ? "Close chat" : "Open AI chat"}
        aria-expanded={open}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        transition={spring}
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-ios-blue to-ios-indigo text-white shadow-[0_10px_30px_-6px_rgba(10,132,255,0.65),inset_0_1px_0_rgba(255,255,255,0.3)]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "x" : "chat"}
            initial={{ opacity: 0, rotate: -60, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 60, scale: 0.5 }}
            transition={{ duration: 0.18 }}
          >
            {open ? <X size={24} /> : <MessageCircle size={24} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
