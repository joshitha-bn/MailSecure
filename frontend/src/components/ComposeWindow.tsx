"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { db } from "@/utils/gun"
import { isStorageReady } from "@/utils/web3storage"
import { normalizeAndDedupeRecipients } from "@/utils/recipientUtils"
import { isInternalDmailAddress } from "@/utils/config"
import {
  PenLine, Save, Minus, Maximize2, Minimize2, X,
  Check, WifiOff, AlertCircle, Send, Calendar,
  Paperclip, Archive, Clock, ShieldCheck, AlertTriangle, Link, Lock,
  ChevronDown, ChevronUp
} from "lucide-react"

type StatusType = "idle" | "sending" | "success" | "error"
type WindowState = "open" | "minimized" | "maximized"

interface AttachedFile {
  id: string
  name: string
  size: string
  type: "local" | "ipfs"
  cid?: string
  data?: string
  rawFile?: File
}

interface ComposeWindowProps {
  onClose: () => void
  defaultTo?: string
  defaultCc?: string
  defaultBcc?: string
  defaultSubject?: string
  defaultMessage?: string
  defaultDraftId?: string
}

// Unique key generator to isolate inputs from each other in the browser DOM
let composeInstanceCount = 0

export default function ComposeWindow({
  onClose,
  defaultTo = "",
  defaultCc = "",
  defaultBcc = "",
  defaultSubject = "",
  defaultMessage = "",
  defaultDraftId,
}: ComposeWindowProps) {
  // Assign a stable instance ID so input IDs are unique across re-renders
  const instanceId = useRef(`cw_${++composeInstanceCount}`).current

  // ── Independent recipient states — DO NOT share or derive from each other ──
  const [recipientEmail, setRecipientEmail] = useState<string>(() =>
    normalizeAndDedupeRecipients(defaultTo)
  )
  const [cc, setCc] = useState<string>(() =>
    normalizeAndDedupeRecipients(defaultCc)
  )
  const [bcc, setBcc] = useState<string>(() =>
    normalizeAndDedupeRecipients(defaultBcc)
  )

  const [isFocused, setIsFocused] = useState(false)
  const [showCcBcc, setShowCcBcc] = useState(!!(defaultCc || defaultBcc))
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage)
  const [status, setStatus] = useState<StatusType>("idle")
  const [statusMsg, setStatusMsg] = useState("")
  const [windowState, setWindowState] = useState<WindowState>("open")
  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState("")
  const [scheduleTime, setScheduleTime] = useState("")
  const [ipfsCid, setIpfsCid] = useState("")
  const [showIpfsInput, setShowIpfsInput] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [draftLastSaved, setDraftLastSaved] = useState<string | null>(null)
  const [encryptionReady, setEncryptionReady] = useState<"checking" | "ready" | "no-key">("checking")
  const [storageReady, setStorageReady] = useState(false)
  const [isSending, setIsSending] = useState(false)

  // Track current draftId — allows update-in-place
  const currentDraftId = useRef<string | null>(defaultDraftId || null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Encryption key check ──────────────────────────────────────────────────
  useEffect(() => {
    const normalizedRecipient = recipientEmail.trim().toLowerCase()
    if (!normalizedRecipient || !normalizedRecipient.includes("@")) {
      setEncryptionReady("checking")
      return
    }
    const isDmail = isInternalDmailAddress(normalizedRecipient)
    if (!isDmail) {
      setEncryptionReady("no-key")
      return
    }
    const timer = setTimeout(() => {
      db.getUser(normalizedRecipient, (data: any) => {
        setEncryptionReady(data?.publicKey ? "ready" : "no-key")
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [recipientEmail])

  useEffect(() => {
    isStorageReady().then(setStorageReady)
  }, [])

  // ── Auto-save every 30s when there's content ─────────────────────────────
  useEffect(() => {
    if (!subject && !message && !recipientEmail && !cc && !bcc) return
    const timer = setInterval(() => saveDraft(true), 30000)
    return () => clearInterval(timer)
  }, [recipientEmail, cc, bcc, subject, message, attachments])

  // ── Draft persistence ─────────────────────────────────────────────────────
  const saveDraft = useCallback((auto = false) => {
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return

    const normalizedEmail = user.email.trim().toLowerCase()
    const stored = localStorage.getItem(`drafts_${normalizedEmail}`)
    let drafts: any[] = stored ? JSON.parse(stored) : []

    const cleanTo = normalizeAndDedupeRecipients(recipientEmail)
    const cleanCc = normalizeAndDedupeRecipients(cc)
    const cleanBcc = normalizeAndDedupeRecipients(bcc)
    const now = new Date()
    const savedAt = now.toLocaleString()

    const draft = {
      id: currentDraftId.current || `draft_${Date.now()}`,
      to: cleanTo,
      cc: cleanCc,
      bcc: cleanBcc,
      subject,
      message,
      savedAt,
      // Store attachment metadata (names + sizes) — not binary data
      attachmentNames: attachments.map(a => ({ name: a.name, size: a.size, type: a.type, cid: a.cid })),
    }

    // Update-in-place if we already have a draftId; otherwise prepend
    if (currentDraftId.current) {
      const idx = drafts.findIndex(d => d.id === currentDraftId.current)
      if (idx !== -1) {
        drafts[idx] = draft
      } else {
        drafts.unshift(draft)
      }
    } else {
      // New draft — assign the ID
      currentDraftId.current = draft.id
      drafts.unshift(draft)
    }

    localStorage.setItem(`drafts_${normalizedEmail}`, JSON.stringify(drafts.slice(0, 50)))
    setDraftLastSaved(savedAt)

    if (!auto) {
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2500)
    }
  }, [recipientEmail, cc, bcc, subject, message, attachments])

  const deleteDraftOnSend = () => {
    if (!currentDraftId.current) return
    const user = JSON.parse(localStorage.getItem("user") || "{}")
    if (!user.email) return
    const normalizedEmail = user.email.trim().toLowerCase()
    const stored = localStorage.getItem(`drafts_${normalizedEmail}`)
    if (!stored) return
    const drafts = JSON.parse(stored).filter((d: any) => d.id !== currentDraftId.current)
    localStorage.setItem(`drafts_${normalizedEmail}`, JSON.stringify(drafts))
  }

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const newFile: AttachedFile = {
          id: `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size < 1024 * 1024
            ? `${(file.size / 1024).toFixed(1)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          type: "local",
          data: reader.result as string,
          rawFile: file,
        }
        setAttachments((prev) => [...prev, newFile])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ""
  }

  const handleIpfsAttach = () => {
    const cid = ipfsCid.trim()
    if (!cid || (!cid.startsWith("Qm") && !cid.startsWith("bafy"))) return
    const newFile: AttachedFile = {
      id: `ipfs_${Date.now()}`,
      name: `IPFS: ${cid.slice(0, 12)}...`,
      size: "Decentralized",
      type: "ipfs",
      cid,
    }
    setAttachments((prev) => [...prev, newFile])
    setIpfsCid("")
    setShowIpfsInput(false)
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendMail = async () => {
    if (isSending) return // Prevent double-send
    const userJson = localStorage.getItem("user")
    const user = userJson ? JSON.parse(userJson) : {}

    const cleanTo = normalizeAndDedupeRecipients(recipientEmail)
    const cleanCc = normalizeAndDedupeRecipients(cc)
    const cleanBcc = normalizeAndDedupeRecipients(bcc)

    if (!cleanTo || !subject || !message) {
      setStatus("error")
      setStatusMsg("Please fill in all fields before sending.")
      return
    }

    setIsSending(true)

    try {
      const { sendMailInBackground } = await import("@/utils/backgroundSend")

      // Delete draft before sending to prevent orphaned drafts
      deleteDraftOnSend()

      // 🔥 INSTANT DISPATCH: We don't wait for encryption/PoW/IPFS
      sendMailInBackground({
        user,
        recipientEmail: cleanTo,
        subject,
        message,
        attachments,
        scheduleDate,
        scheduleTime,
        cc: cleanCc,
        bcc: cleanBcc,
      })

      // Close immediately
      onClose()
    } catch (err: any) {
      setIsSending(false)
      setStatus("error")
      setStatusMsg(`Dispatch Error: ${err?.message}`)
    }
  }

  // ── Minimized pill ──────────────────────────────────────────────────────────
  if (windowState === "minimized") {
    return (
      <div
        onClick={() => setWindowState("open")}
        style={{
          position: "fixed", bottom: "0", right: "24px", zIndex: 1000,
          background: "var(--bg-card)", border: "1px solid var(--border-gold)",
          borderBottom: "none", borderRadius: "10px 10px 0 0",
          padding: "10px 20px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "10px",
          boxShadow: "var(--shadow-deep)",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <span style={{ fontSize: "13px", color: "var(--text-bright)", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
          <PenLine size={14} color="var(--gold-mid)" /> {subject || "New Message"}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {recipientEmail || "No recipient"}
        </span>
        <span style={{
          marginLeft: "8px", fontSize: "11px", color: "var(--text-muted)",
          padding: "2px 8px", borderRadius: "6px",
          background: "rgba(212, 175, 55,0.1)",
        }}>Expand</span>
      </div>
    )
  }

  const isMaximized = windowState === "maximized"

  return (
    <div
      className="compose-window-outer"
      style={{
        position: "fixed", zIndex: 1000,
        bottom: isMaximized ? "0" : "24px",
        right: isMaximized ? "0" : "24px",
        width: isMaximized ? "100vw" : "800px",
        height: isMaximized ? "100vh" : "620px",
        background: "var(--bg-input)",
        borderTop: "3px solid var(--gold-mid)",
        borderRadius: isMaximized ? "0" : "10px",
        boxShadow: "var(--shadow-deep)",
        display: "flex", flexDirection: "column",
        overflow: "hidden", transition: "all 0.2s ease",
        fontFamily: "Inter, sans-serif",
        border: "1px solid var(--border-color)",
        borderTopColor: "var(--gold-mid)",
      }}
    >

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px",
        background: "var(--bg-compose-hdr)",
        borderBottom: "1px solid var(--border-color)",
      }}>
        <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--gold-mid)", display: "flex", alignItems: "center", gap: "8px" }}>
          <PenLine size={14} /> New Message
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Encryption badge */}
          <div style={{
            background: encryptionReady === "ready"
              ? "rgba(34, 197, 94, 0.1)"
              : "rgba(212, 175, 55, 0.08)",
            border: `1px solid ${encryptionReady === "ready" ? "rgba(34, 197, 94, 0.2)" : "rgba(212, 175, 55, 0.15)"}`,
            borderRadius: "20px", padding: "3px 10px",
            display: "flex", alignItems: "center", gap: "6px"
          }}>
            <div style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: encryptionReady === "ready" ? "#22c55e" : "var(--gold-mid)"
            }} />
            <span style={{
              fontSize: "10px",
              color: encryptionReady === "ready" ? "#22c55e" : "var(--gold-mid)",
              fontWeight: "700"
            }}>
              {encryptionReady === "ready" ? "E2E Encrypted" : "IPFS Storage"}
            </span>
          </div>

          {/* Window controls */}
          <button
            onClick={() => setWindowState(windowState === "maximized" ? "open" : "maximized")}
            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", padding: "4px" }}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={() => setWindowState("minimized")}
            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", padding: "4px" }}
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--text-dim)",
              cursor: "pointer", display: "flex", padding: "4px",
              borderRadius: "4px", transition: "color 0.15s, background 0.15s"
            }}
            title="Close"
            onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.08)" }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Recipient Fields ── */}
      <div style={{ borderBottom: "1px solid var(--border-color)", flexShrink: 0 }}>

        {/* TO row */}
        <div style={{ display: "flex", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid var(--border-color)" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", width: "52px", letterSpacing: "0.05em" }}>TO</span>
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            {recipientEmail && recipientEmail.includes("@") && recipientEmail.split("@")[1]?.includes(".") && !isFocused ? (
              <div
                onClick={() => setIsFocused(true)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "rgba(160, 114, 10, 0.1)",
                  color: "var(--gold-mid)",
                  padding: "3px 10px", borderRadius: "4px",
                  fontSize: "13px", fontWeight: "600", cursor: "text",
                  border: "1px solid rgba(160, 114, 10, 0.2)"
                }}
              >
                {recipientEmail}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setRecipientEmail(""); setIsFocused(true) }}
                  style={{ background: "none", border: "none", color: "var(--gold-mid)", cursor: "pointer", display: "flex", alignItems: "center", padding: "1px" }}
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <input
                id={`${instanceId}_to`}
                name={`${instanceId}_to`}
                type="text"
                autoComplete="new-password"
                data-form-type="other"
                spellCheck={false}
                style={{ background: "none", border: "none", outline: "none", color: "var(--text-bright)", fontSize: "13px", flex: 1, minWidth: "200px" }}
                placeholder="recipient@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setIsFocused(false)
                  setRecipientEmail(prev => normalizeAndDedupeRecipients(prev))
                }}
                autoFocus={isFocused}
              />
            )}
          </div>
          <button
            onClick={() => setShowCcBcc(!showCcBcc)}
            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "4px" }}
            title={showCcBcc ? "Hide CC/BCC" : "Show CC/BCC"}
          >
            {showCcBcc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            CC/BCC
          </button>
        </div>

        {/* CC row */}
        {showCcBcc && (
          <>
            <div style={{ display: "flex", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid var(--border-color)" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", width: "52px", letterSpacing: "0.05em" }}>CC</span>
              <input
                id={`${instanceId}_cc`}
                name={`${instanceId}_cc`}
                type="text"
                autoComplete="new-password"
                data-form-type="other"
                spellCheck={false}
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-bright)", fontSize: "13px" }}
                placeholder="cc@example.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                onBlur={() => setCc(prev => normalizeAndDedupeRecipients(prev))}
              />
            </div>

            {/* BCC row */}
            <div style={{ display: "flex", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid var(--border-color)" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", width: "52px", letterSpacing: "0.05em" }}>BCC</span>
              <input
                id={`${instanceId}_bcc`}
                name={`${instanceId}_bcc`}
                type="text"
                autoComplete="new-password"
                data-form-type="other"
                spellCheck={false}
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-bright)", fontSize: "13px" }}
                placeholder="bcc@example.com"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                onBlur={() => setBcc(prev => normalizeAndDedupeRecipients(prev))}
              />
            </div>
          </>
        )}

        {/* SUBJECT row */}
        <div style={{ display: "flex", alignItems: "center", padding: "10px 20px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", width: "52px", letterSpacing: "0.05em" }}>SUBJ</span>
          <input
            id={`${instanceId}_subject`}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-bright)", fontSize: "14px", fontWeight: "500" }}
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {/* ── Body ── */}
      <textarea
        style={{
          flex: 1, background: "none", border: "none", outline: "none",
          padding: "20px", fontSize: "14px", color: "var(--text-muted)",
          lineHeight: "1.8", resize: "none",
        }}
        placeholder="Write your message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      {/* ── Status message ── */}
      {status === "error" && (
        <div style={{
          padding: "8px 20px", background: "rgba(239,68,68,0.08)",
          borderTop: "1px solid rgba(239,68,68,0.2)",
          color: "#ef4444", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px"
        }}>
          <AlertCircle size={14} /> {statusMsg}
        </div>
      )}

      {/* ── Attachments chips ── */}
      {attachments.length > 0 && (
        <div style={{ padding: "8px 20px", flexShrink: 0, borderTop: "1px solid var(--border-color)", display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {attachments.map((att) => (
            <div key={att.id} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "4px 10px", borderRadius: "6px",
              background: "var(--bg-deep)", border: "1px solid var(--border-color)",
              fontSize: "12px", color: "var(--text-muted)"
            }}>
              {att.type === "ipfs" ? <Archive size={11} /> : <Paperclip size={11} />}
              <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
              <button onClick={() => removeAttachment(att.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", alignItems: "center" }}><X size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {/* ── IPFS CID input ── */}
      {showIpfsInput && (
        <div style={{ padding: "10px 20px", flexShrink: 0, borderTop: "1px solid var(--border-color)", display: "flex", gap: "8px", alignItems: "center", background: "var(--bg-deep)" }}>
          <input
            style={{ flex: 1, padding: "7px 12px", background: "var(--bg-input)", border: "1px solid var(--border-color)", borderRadius: "6px", color: "var(--text-bright)", fontSize: "12px", outline: "none" }}
            placeholder="Paste IPFS CID (Qm...)"
            value={ipfsCid}
            onChange={(e) => setIpfsCid(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleIpfsAttach()}
            autoFocus
          />
          <button onClick={handleIpfsAttach} style={{ padding: "7px 14px", borderRadius: "6px", cursor: "pointer", background: "var(--gold-mid)", border: "none", color: "#fff", fontSize: "11px", fontWeight: "700" }}>Attach</button>
          <button onClick={() => { setShowIpfsInput(false); setIpfsCid("") }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)" }}><X size={16} /></button>
        </div>
      )}

      {/* ── Schedule picker ── */}
      {showSchedule && (
        <div style={{ padding: "10px 20px", flexShrink: 0, borderTop: "1px solid var(--border-color)", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", background: "var(--bg-deep)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: "700" }}>SEND AT:</span>
          <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
            style={{ padding: "5px 10px", borderRadius: "6px", background: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-bright)", fontSize: "11px", outline: "none" }}
          />
          <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: "6px", background: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-bright)", fontSize: "11px", outline: "none" }}
          />
          <button onClick={() => { setShowSchedule(false); setScheduleDate(""); setScheduleTime("") }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gold-mid)", fontSize: "11px", fontWeight: "700" }}>CLEAR</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ padding: "12px 20px", background: "var(--bg-compose-hdr)", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)" }}>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ width: "32px", height: "32px", background: "none", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-dim)", transition: "all 0.15s" }}
            title="Attach Local File"
            onMouseEnter={e => { e.currentTarget.style.color = "var(--gold-mid)"; e.currentTarget.style.background = "var(--bg-hover)" }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none" }}
          >
            <Paperclip size={15} />
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileAttach} />

          <button
            onClick={() => setShowIpfsInput(!showIpfsInput)}
            style={{ width: "32px", height: "32px", background: showIpfsInput ? "rgba(160,114,10,0.1)" : "none", border: `1px solid ${showIpfsInput ? "var(--gold-mid)" : "var(--border-color)"}`, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showIpfsInput ? "var(--gold-mid)" : "var(--text-dim)", transition: "all 0.15s" }}
            title="Attach IPFS CID"
          >
            <Archive size={15} />
          </button>

          <button
            onClick={() => setShowSchedule(!showSchedule)}
            style={{ width: "32px", height: "32px", background: showSchedule ? "rgba(160,114,10,0.1)" : "none", border: `1px solid ${showSchedule ? "var(--gold-mid)" : "var(--border-color)"}`, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showSchedule ? "var(--gold-mid)" : "var(--text-dim)", transition: "all 0.15s" }}
            title="Schedule Send"
          >
            <Clock size={15} />
          </button>

          <div style={{ width: "1px", height: "24px", background: "var(--border-color)", margin: "0 4px" }} />

          {/* Save Draft button */}
          <button
            onClick={() => saveDraft(false)}
            style={{ height: "32px", padding: "0 12px", background: draftSaved ? "rgba(34,197,94,0.1)" : "none", border: `1px solid ${draftSaved ? "rgba(34,197,94,0.3)" : "var(--border-color)"}`, borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: draftSaved ? "#22c55e" : "var(--text-dim)", fontSize: "11px", fontWeight: "600", transition: "all 0.2s" }}
            title="Save Draft"
            onMouseEnter={e => { if (!draftSaved) { e.currentTarget.style.color = "var(--gold-mid)"; e.currentTarget.style.borderColor = "var(--gold-mid)" } }}
            onMouseLeave={e => { if (!draftSaved) { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border-color)" } }}
          >
            {draftSaved ? <Check size={13} /> : <Save size={13} />}
            {draftSaved ? "Saved!" : "Save Draft"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Last saved indicator */}
          {draftLastSaved && !draftSaved && (
            <span style={{ fontSize: "10px", color: "var(--text-dim)", opacity: 0.7 }}>
              Saved {draftLastSaved}
            </span>
          )}

          {/* Send button */}
          <button
            onClick={sendMail}
            disabled={isSending}
            style={{
              background: "var(--gold-mid)", color: "#000", border: "none",
              padding: "9px 24px", borderRadius: "8px", fontWeight: "700",
              fontSize: "13px", cursor: isSending ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "8px",
              boxShadow: "0 2px 8px rgba(160, 114, 10, 0.3)",
              opacity: isSending ? 0.7 : 1,
              transition: "all 0.15s"
            }}
            onMouseEnter={e => { if (!isSending) e.currentTarget.style.transform = "translateY(-1px)" }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}
          >
            <Send size={14} />
            {isSending ? "Sending..." : "Send Encrypted"}
          </button>
        </div>
      </div>
    </div>
  )
}
