import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface CallerContext {
  user: { id: string; email?: string; email_confirmed_at?: string | null };
  profile: {
    id: string;
    institution_id: string;
    full_name: string;
    email: string;
    role: 'admin' | 'teacher' | 'student';
    account_status: string;
    identifier: string | null;
  } | null;
  admin: SupabaseClient;
}

// New-style API keys (sb_publishable_/sb_secret_) are exposed under different
// env names on newer projects — support both.
function anonKey(): string {
  return Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
}

function serviceKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve the calling user and their profile. Returns null profile when the
 * user has no institution profile yet (e.g. mid-registration / join request).
 */
export async function getCallerContext(req: Request): Promise<CallerContext | { error: string; status: number }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: 'missing authorization header', status: 401 };

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    anonKey(),
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { error: 'invalid or expired session', status: 401 };

  const admin = adminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return { user, profile: profile ?? null, admin };
}

export function requireProfile(
  ctx: CallerContext | { error: string; status: number },
): ctx is CallerContext & { profile: NonNullable<CallerContext['profile']> } {
  return 'profile' in ctx && ctx.profile !== null;
}

export function requireActive(
  ctx: CallerContext | { error: string; status: number },
): ctx is CallerContext & { profile: NonNullable<CallerContext['profile']> } {
  return requireProfile(ctx) && ctx.profile!.account_status === 'active';
}
