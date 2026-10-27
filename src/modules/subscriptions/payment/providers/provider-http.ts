import { BadGatewayException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export interface HttpResult<T = any> {
  status: number;
  ok: boolean;
  data: T;
}

/** Appel HTTP JSON/formulaire vers une passerelle, avec délai maximal. */
export async function providerFetch<T = any>(
  provider: string,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    json?: any;
    form?: Record<string, string | number | undefined | null>;
    timeoutMs?: number;
  } = {},
): Promise<HttpResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers ?? {}) };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  } else if (init.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(init.form)) {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    }
    body = params.toString();
  }
  try {
    const res = await fetch(url, {
      method: init.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    return { status: res.status, ok: res.ok, data };
  } catch (error) {
    const reason =
      (error as Error)?.name === 'AbortError'
        ? 'délai dépassé'
        : (error as Error)?.message ?? 'erreur réseau';
    throw new BadGatewayException(`${provider} injoignable : ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function requireSecrets(
  provider: string,
  secrets: Record<string, string>,
  keys: string[],
): void {
  const missing = keys.filter((k) => !String(secrets?.[k] ?? '').trim());
  if (missing.length) {
    throw new BadGatewayException(
      `${provider} : configuration incomplète (${missing.join(', ')}).`,
    );
  }
}
