// Minimal Gmail SMTP client for Deno (port 465, implicit TLS).
// Sends via a Gmail account + App Password — set GMAIL_USER and
// GMAIL_APP_PASSWORD as edge-function secrets.

interface SmtpResult {
  ok: boolean;
  error?: string;
}

async function readReply(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<{ code: number; text: string }> {
  const buf = new Uint8Array(8192);
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value ?? buf);
  // Multi-line replies end with "<code> " prefix on the last line.
  const code = parseInt(text.trim().slice(0, 3), 10);
  return { code: Number.isNaN(code) ? 0 : code, text };
}

function line(w: WritableStreamDefaultWriter<Uint8Array>, s: string) {
  return w.write(new TextEncoder().encode(s + '\r\n'));
}

/** Send one email over Gmail SMTP (smtps://smtp.gmail.com:465). */
export async function sendViaGmail(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SmtpResult> {
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) return { ok: false, error: 'GMAIL_USER/GMAIL_APP_PASSWORD not configured' };

  let conn: Deno.TlsConn | null = null;
  try {
    conn = await Deno.connectTls({ hostname: 'smtp.gmail.com', port: 465 });
    const reader = conn.readable.getReader();
    const writer = conn.writable.getWriter();

    const expect = async (want: number | number[], step: string) => {
      const r = await readReply(reader);
      const ok = Array.isArray(want) ? want.includes(r.code) : r.code === want;
      if (!ok) throw new Error(`${step}: expected ${want}, got ${r.code} ${r.text.slice(0, 200)}`);
    };

    await expect(220, 'greeting');
    await line(writer, 'EHLO campflow.local');
    await expect(250, 'ehlo');
    await line(writer, 'AUTH LOGIN');
    await expect(334, 'auth');
    await line(writer, btoa(user));
    await expect(334, 'user');
    await line(writer, btoa(pass));
    await expect(235, 'password');
    await line(writer, `MAIL FROM:<${user}>`);
    await expect(250, 'mail-from');
    await line(writer, `RCPT TO:<${opts.to}>`);
    await expect([250, 251], 'rcpt-to');
    await line(writer, 'DATA');
    await expect(354, 'data');

    const boundary = `cc-${crypto.randomUUID()}`;
    const msg =
      `From: Campflow <${user}>\r\n` +
      `To: ${opts.to}\r\n` +
      `Subject: ${opts.subject}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: multipart/alternative; boundary="${boundary}"\r\n` +
      `\r\n--${boundary}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      `${opts.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/html; charset=utf-8\r\n\r\n${opts.html}\r\n` +
      `--${boundary}--\r\n.\r\n`;
    await writer.write(new TextEncoder().encode(msg));
    await expect(250, 'send');
    await line(writer, 'QUIT').catch(() => {});
    reader.releaseLock();
    writer.releaseLock();
    conn.close();
    return { ok: true };
  } catch (e) {
    try {
      conn?.close();
    } catch {
      /* already closed */
    }
    return { ok: false, error: (e as Error).message };
  }
}
