"use client";

import { useState, useRef, useEffect } from "react";
import { storeApi } from "@/lib/api";
import { LuMessageSquare, LuX, LuSend, LuBot, LuUser, LuLoader } from "react-icons/lu";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm Koraa AI. How can I help you manage your stores today?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = input.trim();
    setInput("");
    
    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);
    
    try {
      const res = await storeApi.aiChat(userMsg, messages);
      setMessages([...newMessages, { role: "assistant", content: res.data.reply }]);
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: "I'm sorry, I encountered an error right now." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .ai-msg-markdown p { margin-bottom: 8px; }
        .ai-msg-markdown p:last-child { margin-bottom: 0; }
        .ai-msg-markdown ul, .ai-msg-markdown ol { margin-left: 20px; margin-bottom: 8px; }
        .ai-msg-markdown ul { list-style-type: disc; }
        .ai-msg-markdown ol { list-style-type: decimal; }
        .ai-msg-markdown li { margin-bottom: 4px; }
        .ai-msg-markdown li:last-child { margin-bottom: 0; }
        .ai-msg-markdown strong { font-weight: 700; }
        .ai-msg-markdown a { color: inherit; text-decoration: underline; }
      `}</style>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed",
              bottom: 80,
              right: 24,
              width: 350,
              height: 500,
              background: "var(--surface-900)",
              border: "1px solid var(--border)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
          >
            {/* Header */}
            <div style={{ background: "var(--brand-600)", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <LuBot size={20} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Koraa AI Assistant</span>
              </div>
              <button onClick={() => setIsOpen(false)} style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", display: "flex" }}>
                <LuX size={18} />
              </button>
            </div>

            {/* Chat Area */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12, background: "var(--surface)" }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 0, background: msg.role === "user" ? "var(--surface-700)" : "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {msg.role === "user" ? <LuUser size={14} color="var(--text-secondary)" /> : <LuBot size={14} color="var(--brand-600)" />}
                  </div>
                  <div className="ai-msg-markdown" style={{
                    background: msg.role === "user" ? "var(--brand-600)" : "#ffffff",
                    color: msg.role === "user" ? "#ffffff" : "#1a1a1a",
                    padding: "10px 14px",
                    border: msg.role === "user" ? "none" : "1px solid #e5e7eb",
                    fontSize: 13,
                    lineHeight: 1.5,
                    maxWidth: "80%"
                  }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 28, height: 28, background: "var(--surface-900)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <LuBot size={14} color="var(--brand-600)" />
                  </div>
                  <div style={{ background: "var(--surface-900)", padding: "10px 14px", border: "1px solid var(--border)" }}>
                    <LuLoader size={14} className="spin" color="var(--text-muted)" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: "12px", borderTop: "1px solid var(--border)", background: "var(--surface-900)", display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Ask me about your stores..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                style={{ flex: 1, padding: "10px 14px", border: "1px solid var(--border)", fontSize: 13, outline: "none", color: "var(--text-primary)" }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                style={{
                  background: input.trim() && !isLoading ? "var(--brand-600)" : "var(--surface-700)",
                  color: input.trim() && !isLoading ? "white" : "var(--text-muted)",
                  border: "none", width: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s"
                }}
              >
                <LuSend size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 50,
          height: 50,
          background: "var(--brand-solid)",
          color: "var(--on-brand-solid)",
          border: "none",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          /* Was a violet shadow under an ochre button. Mixed from the
             button's own fill so the two can never drift apart again. */
          boxShadow: "0 4px 12px color-mix(in srgb, var(--brand-solid) 32%, transparent)",
          zIndex: 9999,
          transition: "transform 0.2s"
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
      >
        {isOpen ? <LuX size={22} /> : <LuMessageSquare size={22} />}
      </button>
    </>
  );
}
