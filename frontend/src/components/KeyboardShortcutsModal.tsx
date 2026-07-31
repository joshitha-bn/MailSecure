"use client"

import React from "react"
import { X, Keyboard, Command } from "lucide-react"

interface KeyboardShortcutsModalProps {
  onClose: () => void
}

export default function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  const shortcuts = [
    { key: "C", description: "Compose new message" },
    { key: "/", description: "Focus search bar" },
    { key: "?", description: "Open keyboard shortcuts cheat sheet" },
    { key: "Esc", description: "Close modal / cancel compose" },
    { key: "E", description: "Archive selected message" },
    { key: "# / Del", description: "Delete selected message" },
    { key: "U", description: "Mark message as Unread" },
    { key: "I", description: "Mark message as Read" },
  ]

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 2000, background: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "20px"
    }}>
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border-gold)",
        borderRadius: "12px", width: "100%", maxWidth: "520px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6)", overflow: "hidden",
        fontFamily: "Inter, sans-serif"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 24px", background: "var(--bg-compose-hdr)",
          borderBottom: "1px solid var(--border-color)",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--gold-mid)", fontWeight: "700", fontSize: "15px" }}>
            <Keyboard size={18} />
            Keyboard Shortcuts
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", padding: "4px" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {shortcuts.map((sc, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", borderRadius: "6px",
              background: "var(--bg-deep)", border: "1px solid var(--border-color)"
            }}>
              <span style={{ fontSize: "13px", color: "var(--text-bright)", fontWeight: "500" }}>{sc.description}</span>
              <kbd style={{
                background: "rgba(160, 114, 10, 0.15)", border: "1px solid var(--gold-mid)",
                color: "var(--gold-mid)", padding: "3px 10px", borderRadius: "5px",
                fontSize: "12px", fontWeight: "700", fontFamily: "monospace"
              }}>
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px", background: "var(--bg-deep)",
          borderTop: "1px solid var(--border-color)", textAlign: "center",
          fontSize: "11px", color: "var(--text-dim)"
        }}>
          Press <kbd style={{ color: "var(--gold-mid)" }}>Esc</kbd> or click X to dismiss
        </div>
      </div>
    </div>
  )
}
