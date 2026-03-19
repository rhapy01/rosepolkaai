import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User } from "lucide-react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatConversationProps {
  messages: ChatMessage[];
  isProcessing?: boolean;
  emptyPlaceholder?: React.ReactNode;
  className?: string;
  pendingConfirmation?: {
    id: string;
    prompt: string;
    options?: string[];
    customInput?: {
      placeholder?: string;
      submitLabel?: string;
    };
  } | null;
  onConfirmYes?: () => void;
  onConfirmNo?: () => void;
  onSelectOption?: (option: string) => void;
  onCustomInputSubmit?: (value: string) => void;
}

export default function ChatConversation({
  messages,
  isProcessing = false,
  emptyPlaceholder,
  className = "",
  pendingConfirmation = null,
  onConfirmYes,
  onConfirmNo,
  onSelectOption,
  onCustomInputSubmit,
}: ChatConversationProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isProcessing]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col w-full max-w-[800px] overflow-hidden ${className}`}
    >
      <div
        className="flex flex-col gap-4 pb-2 overflow-y-auto overflow-x-hidden scrollbar-thin"
        style={{ minHeight: "min(320px, 50vh)", maxHeight: "min(480px, 58vh)" }}
      >
          <AnimatePresence initial={false}>
            {messages.length === 0 && emptyPlaceholder ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center py-8 px-4 text-center"
              >
                {emptyPlaceholder}
              </motion.div>
            ) : (
              messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "tween", duration: 0.2 }}
                  className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex items-start gap-2 max-w-[85%] sm:max-w-[75%] ${
                      msg.role === "user" ? "flex-row-reverse" : ""
                    }`}
                  >
                    <div
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                        msg.role === "user"
                          ? "bg-primary text-white"
                          : "bg-[#1a1a22] text-white/70"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <User className="w-3.5 h-3.5" />
                      ) : (
                        <Bot className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm border ${
                        msg.role === "user"
                          ? "rounded-tr-md bg-primary/15 border-primary/35 text-white"
                          : "rounded-tl-md bg-[#101017] border-white/10 text-[#f5f5f7]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
            {isProcessing && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="flex items-start gap-2 max-w-[85%] sm:max-w-[75%]">
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#1a1a22] text-white/70">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5 border border-white/10 bg-[#101017]">
                    <span className="w-2 h-2 rounded-full bg-white/50 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 rounded-full bg-white/50 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 rounded-full bg-white/50 animate-bounce" />
                  </div>
                </div>
              </motion.div>
            )}
            {pendingConfirmation && (
              <motion.div
                key={`confirm-${pendingConfirmation.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="flex items-start gap-2 max-w-[85%] sm:max-w-[75%]">
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#1a1a22] text-white/70">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="rounded-2xl rounded-tl-md px-4 py-2.5 border border-white/10 bg-[#101017]">
                    <p className="whitespace-pre-wrap break-words text-sm text-[#f5f5f7]">{pendingConfirmation.prompt}</p>
                    {pendingConfirmation.options && pendingConfirmation.options.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {pendingConfirmation.options.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => onSelectOption?.(option)}
                            className="text-xs px-3 py-1.5 rounded-full border border-primary/40 bg-primary text-white hover:bg-primary/90 transition-colors"
                          >
                            {option}
                          </button>
                        ))}
                        {pendingConfirmation.customInput && (
                          <div className="w-full mt-3 flex items-center gap-2">
                            <input
                              value={customValue}
                              onChange={(e) => setCustomValue(e.target.value)}
                              placeholder={pendingConfirmation.customInput.placeholder || "Enter amount"}
                              className="flex-1 text-xs px-3 py-1.5 rounded-full border border-white/10 bg-transparent text-white placeholder:text-white/35 outline-none"
                              inputMode="decimal"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onCustomInputSubmit?.(customValue);
                                setCustomValue("");
                              }}
                              className="text-xs px-3 py-1.5 rounded-full border border-primary/40 bg-primary text-white hover:bg-primary/90 transition-colors"
                            >
                              {pendingConfirmation.customInput.submitLabel || "Use"}
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={onConfirmNo}
                          className="text-xs px-3 py-1.5 rounded-full border border-white/15 bg-transparent text-white/70 hover:bg-white/10 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onConfirmYes}
                          className="text-xs px-3 py-1.5 rounded-full border border-primary/40 bg-primary text-white hover:bg-primary/90 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={onConfirmNo}
                          className="text-xs px-3 py-1.5 rounded-full border border-white/15 bg-transparent text-white/70 hover:bg-white/10 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} className="h-0" aria-hidden />
        </div>
    </div>
  );
}
