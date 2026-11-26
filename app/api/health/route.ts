import { NextResponse } from "next/server";
import { storageMode } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Setup check: reports which settings are present — never their values. */
export async function GET() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return NextResponse.json(
    {
      storage: storageMode(),
      supabaseUrl: url ? (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url.trim()) ? "set" : "set, but doesn't look like https://<ref>.supabase.co") : "missing",
      supabaseKey: key ? (key.startsWith("sb_secret_") || key.startsWith("eyJ") ? "set" : "set, but doesn't look like a secret or service_role key") : "missing",
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
