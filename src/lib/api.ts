import { supabase } from './supabase';
import { errorMessage } from './utils';

/** Invoke a Supabase Edge Function and unwrap its JSON response. */
export async function callFunction<T = unknown>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = await ctx.json();
        if (j?.error) detail = j.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

export async function safeCall<T>(fn: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: null, error: errorMessage(e) };
  }
}
