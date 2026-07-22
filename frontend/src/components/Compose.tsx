"use client"

/**
 * Compose.tsx — Legacy wrapper
 * Delegates to ComposeWindow which uses PGP (OpenPGP.js) + IPFS (Kubo) + GunDB.
 * The old CryptoJS AES implementation has been removed — it was incompatible
 * with the global mail network and could not be read by any inbox.
 */
import ComposeWindow from "@/components/ComposeWindow"
import { normalizeAndDedupeRecipients } from "@/utils/recipientUtils"

interface ComposeProps {
  onClose: () => void
  defaultTo?: string
  defaultCc?: string
  defaultSubject?: string
  defaultMessage?: string
}

export default function Compose({ onClose, defaultTo, defaultCc, defaultSubject, defaultMessage }: ComposeProps) {
  const cleanTo = normalizeAndDedupeRecipients(defaultTo)
  const cleanCc = normalizeAndDedupeRecipients(defaultCc, [cleanTo])

  return (
    <ComposeWindow
      onClose={onClose}
      defaultTo={cleanTo}
      defaultCc={cleanCc}
      defaultSubject={defaultSubject}
      defaultMessage={defaultMessage}
    />
  )
}
