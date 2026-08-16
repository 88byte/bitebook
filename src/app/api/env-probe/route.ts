// TEMPORARY diagnostic route for the preview "Invalid API key" issue.
// Reports only structural fingerprints of the runtime env (lengths,
// sha256 prefixes, trailing char codes) — never the values themselves.
// REMOVE BEFORE MERGE TO MAIN.

import { createHash } from 'crypto'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function fingerprint(name: string) {
  const v = process.env[name]
  if (v === undefined) return { present: false }
  return {
    present: true,
    len: v.length,
    sha12: createHash('sha256').update(v).digest('hex').slice(0, 12),
    head4: v.slice(0, 4),
    tailCharCodes: Array.from(v.slice(-3)).map((c) => c.charCodeAt(0)),
    trimmedLen: v.trim().length,
    trimmedSha12: createHash('sha256').update(v.trim()).digest('hex').slice(0, 12),
  }
}

export async function GET() {
  return NextResponse.json({
    runtime: process.version,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    url: fingerprint('NEXT_PUBLIC_SUPABASE_URL'),
    anon: fingerprint('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    service: fingerprint('SUPABASE_SERVICE_ROLE_KEY'),
  })
}
