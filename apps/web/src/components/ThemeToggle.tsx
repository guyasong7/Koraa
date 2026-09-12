"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Moon02Icon,
  Sun01Icon,
  MonitorIcon,
} from "@hugeicons/core-free-icons";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div style={{ display: "flex", gap: 4, background: "var(--surface)", padding: 4, borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
        <div style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  const modes = [
    { id: "light", icon: Sun01Icon, label: "Light" },
    { id: "system", icon: MonitorIcon, label: "System" },
    { id: "dark", icon: Moon02Icon, label: "Dark" },
  ];

  return (
    <div style={{ display: "flex", gap: 4, background: "var(--surface)", padding: 4, borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
      {modes.map((mode) => {
        const isActive = theme === mode.id;

        return (
          <button
            key={mode.id}
            onClick={() => setTheme(mode.id)}
            title={mode.label}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 0",
              border: "none",
              borderRadius: "calc(var(--radius-md) - 2px)",
              background: isActive ? "var(--surface-900)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: isActive ? "var(--shadow-sm)" : "none",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <HugeiconsIcon icon={mode.icon} size={14} />
          </button>
        );
      })}
    </div>
  );
}
