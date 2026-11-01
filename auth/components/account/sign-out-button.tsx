"use client"

import { LogOut } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/client/auth-client"

export function SignOutButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      aria-label={label}
      onClick={async () => {
        setBusy(true)
        await authClient.signOut()
        window.location.assign("/login")
      }}
    >
      {!busy && <LogOut className="size-4" />}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  )
}
