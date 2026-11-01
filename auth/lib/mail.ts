import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import type { Locale } from "@/i18n/locales"
import { env, issuer } from "@/lib/env"
import { isPlaceholderEmail } from "@/lib/oidc/claims"
import de from "@/messages/de.json"
import en from "@/messages/en.json"

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export type MailKind = "verifyEmail" | "resetPassword" | "magicLink" | "changeEmail" | "accountDeleted"

let ses: SESv2Client | undefined

/**
 * Sends through Amazon SES v2 when SES_REGION is set; tests set MAIL_OUTBOX_DIR to get JSON files; otherwise
 * (local development) the email and its link are printed to the console.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (isPlaceholderEmail(mail.to)) return
  if (env.SES_REGION) {
    ses ??= new SESv2Client({ region: env.SES_REGION })
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: env.EMAIL_FROM,
        Destination: { ToAddresses: [mail.to] },
        ConfigurationSetName: env.SES_CONFIGURATION_SET,
        Content: {
          Simple: {
            Subject: { Data: mail.subject, Charset: "UTF-8" },
            Body: { Text: { Data: mail.text, Charset: "UTF-8" }, Html: { Data: mail.html, Charset: "UTF-8" } },
          },
        },
      }),
    )
    return
  }
  if (env.MAIL_OUTBOX_DIR) {
    await mkdir(env.MAIL_OUTBOX_DIR, { recursive: true })
    await writeFile(path.join(env.MAIL_OUTBOX_DIR, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(mail))
  }
  if (env.NODE_ENV !== "production" || !env.MAIL_OUTBOX_DIR) {
    // Development: no mail server, so the console is the inbox.
    console.info(`[mail] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}\n`)
  }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "")

/** One account email in `locale`: a short note, one button, and the same as plain text. */
export function composeMail(kind: MailKind, locale: Locale, to: string, vars: { name: string; url?: string; newEmail?: string }): Mail {
  const t = (locale === "en" ? en : de).mail
  const texts = t[kind]
  const plain = { name: vars.name, newEmail: vars.newEmail ?? "" }
  const safe = { name: escapeHtml(vars.name), newEmail: escapeHtml(vars.newEmail ?? "") }
  const button = "button" in texts ? texts.button : undefined
  const lines = [fill(t.greeting, plain), fill(texts.intro, plain)]
  if (vars.url && button) lines.push(`${button}: ${vars.url}`)
  lines.push(t.ignore, t.signoff, `— ${t.footer}`)
  const url = vars.url ? escapeHtml(vars.url) : ""
  const action =
    vars.url && button
      ? `<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#ed6f1a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${escapeHtml(button)}</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#6b6b6b">${escapeHtml(t.fallback)}</p>
<p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${url}" style="color:#ed6f1a">${url}</a></p>`
      : ""
  const html = `<!doctype html>
<html lang="${locale}"><body style="margin:0;background:#f4f4f4;font-family:Jost,Helvetica,Arial,sans-serif;color:#111111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#111111;padding:20px 28px;font-size:22px;font-weight:800;letter-spacing:1px;color:#ffffff">TRETU <span style="color:#ed6f1a">KONTO</span></td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.55">
<p style="margin:0 0 14px">${fill(escapeHtml(t.greeting), safe)}</p>
<p style="margin:0 0 24px">${fill(escapeHtml(texts.intro), safe)}</p>
${action}
<p style="margin:0 0 14px;font-size:14px;color:#6b6b6b">${escapeHtml(t.ignore)}</p>
<p style="margin:0;white-space:pre-line">${escapeHtml(t.signoff)}</p>
</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#8a8a8a;border-top:1px solid #eeeeee">${escapeHtml(t.footer)} · <a href="${escapeHtml(issuer)}/konto" style="color:#8a8a8a">${escapeHtml(new URL(issuer).host)}</a></td></tr>
</table></td></tr></table></body></html>`
  return { to, subject: texts.subject, text: lines.join("\n\n"), html }
}
