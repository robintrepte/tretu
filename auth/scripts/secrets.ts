/**
 * `npm run secrets`: prints freshly generated secrets for a new deployment. Nothing is read from or written to
 * the database or any file; copy the values you need into .env (chmod 600) and the other apps' environments.
 *
 *   BETTER_AUTH_SECRET          this service (never rotate casually: it also encrypts the ID-token signing keys)
 *   client secrets              one per confidential OIDC client: goes into TRETU_OAUTH_CLIENTS_JSON here and into
 *                               TRETU_AUTH_CLIENT_SECRET of that app
 */
import { randomBytes } from "node:crypto"
import { generatedSecrets } from "@/lib/secrets"

const lines = generatedSecrets(process.env.TRETU_OAUTH_CLIENTS_JSON, (bytes) => randomBytes(bytes).toString("base64url"))
process.stdout.write(`${lines.join("\n")}\n`)
