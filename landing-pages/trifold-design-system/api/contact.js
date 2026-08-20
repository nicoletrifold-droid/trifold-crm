const RESEND_API_URL = 'https://api.resend.com/emails';
const TO_EMAIL = 'caio@trifold.eng.br';
const FROM_EMAIL = 'Site Trifold <contato@trifold.eng.br>';

const ALLOWED_ORIGINS = [
  'https://trifold-design-system.vercel.app',
  'https://trifold.eng.br',
  'https://www.trifold.eng.br',
];

const MAX_LEN = { nome: 120, telefone: 30, email: 200, mensagem: 4000 };
const MIN_SUBMIT_MS = 2000; // bots costumam enviar quase instantaneamente

// Rate limit simples em memória (por instância "warm" da function — camada extra, não substitui um WAF)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitStore = new Map();

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (origin) return ALLOWED_ORIGINS.includes(origin);
  if (referer) return ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
  // Sem Origin nem Referer (ex: curl direto) — bloqueia por padrão fora de ambiente de teste manual.
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'too_many_requests' });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: campo invisível no formulário — se vier preenchido, é bot.
  // Responde 200 "de mentira" pra não dar pista ao bot de que foi bloqueado.
  if (body.empresa) {
    return res.status(200).json({ ok: true });
  }

  // Guarda de tempo: formulário muito rápido demais costuma ser bot automatizado.
  const loadedAt = Number(body.loadedAt);
  if (loadedAt && Date.now() - loadedAt < MIN_SUBMIT_MS) {
    return res.status(200).json({ ok: true });
  }

  const nome = (body.nome || '').toString().trim().slice(0, MAX_LEN.nome);
  const telefone = (body.telefone || '').toString().trim().slice(0, MAX_LEN.telefone);
  const email = (body.email || '').toString().trim().slice(0, MAX_LEN.email);
  const mensagem = (body.mensagem || '').toString().trim().slice(0, MAX_LEN.mensagem);

  if (!nome || !email || !mensagem || !isValidEmail(email)) {
    return res.status(400).json({ error: 'invalid_fields' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY não configurada');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const html = `
    <div style="font-family:sans-serif;font-size:15px;color:#111">
      <h2 style="margin:0 0 16px">Novo contato pelo site Trifold</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td style="color:#666">Nome</td><td><strong>${escapeHtml(nome)}</strong></td></tr>
        <tr><td style="color:#666">Telefone</td><td>${escapeHtml(telefone) || '—'}</td></tr>
        <tr><td style="color:#666">E-mail</td><td>${escapeHtml(email)}</td></tr>
      </table>
      <p style="color:#666;margin:20px 0 4px">Mensagem</p>
      <p style="white-space:pre-wrap;margin:0">${escapeHtml(mensagem)}</p>
    </div>
  `;

  try {
    const resendRes = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email,
        subject: `Novo contato pelo site — ${nome}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error('Resend error:', resendRes.status, errBody);
      return res.status(502).json({ error: 'email_send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
};
