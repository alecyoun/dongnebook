// 동네북 데모(dongne.technote.wiki): 책 『AI로 개발하기』 예제 서버(Express + SQLite)를 Cloudflare Worker + D1 + R2로 옮긴 것.
// 주소와 응답 모양은 책의 서버와 같게 두고, 데모용으로 체험 계정 로그인·AI 하루 한도·매일 초기화만 더했습니다.
import { SEED_SQL, DEMO_ACCOUNTS, DEMO_PASSWORD } from './seed.js';
import HELP from './help.js';

const REGIONS = ['역삼동', '삼성동', '대치동', '논현동', '청담동'];
const STATUSES = ['판매중', '예약중', '거래완료'];
const CATEGORIES = ['디지털기기', '가구/인테리어', '생활/주방', '유아동', '스포츠/레저', '도서', '의류/잡화', '기타'];
const PRICES = { bump: 1000 }; // 끌어올리기 1회 1,000원
const MAX_IMAGE = 2 * 1024 * 1024;
const AI_LIMIT_ALL = 100; // 사이트 전체 하루
const AI_LIMIT_IP = 5; // 한 사람(접속 주소) 하루
const COOKIE = 'dn_sess';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const err = (status, error) => json({ error }, status);
const redirect = (to, headers = {}) => new Response(null, { status: 302, headers: { Location: to, ...headers } });

// ---------- 세션(서명한 쿠키) ----------
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function hmacKey(secret) { return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function makeSession(env, user) {
  const body = b64u(enc.encode(JSON.stringify({ ...user, exp: Date.now() + 7 * 864e5 })));
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(body)));
  return `${COOKIE}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
}
const clearSession = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
async function readSession(req, env) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), fromB64u(sig), enc.encode(body));
    if (!ok) return null;
    const u = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    if (u.exp < Date.now()) return null;
    // 매일 초기화로 계정이 다시 만들어져도 같은 번호를 쓰므로, 쿠키의 회원 번호가 아직 있는지만 확인합니다.
    const row = await env.DB.prepare('SELECT id, username, nickname, email, region FROM users WHERE id = ?').bind(u.id).first();
    return row || null;
  } catch { return null; }
}

// ---------- 비밀번호(PBKDF2) ----------
async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: Number(iter) }, key, 256);
  const a = new Uint8Array(bits); const b = Uint8Array.from(atob(hash), (c) => c.charCodeAt(0));
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// ---------- 판매글 ----------
const SEL = 'SELECT p.*, u.nickname AS seller_nickname FROM products p LEFT JOIN users u ON u.id = p.seller_id';
const row = (r) => r && ({
  id: r.id, name: r.name, price: r.price, description: r.description, imageUrl: r.image_url,
  region: r.region, status: r.status, sellerId: r.seller_id, sellerNickname: r.seller_nickname || null,
  bumpedAt: r.bumped_at || null, category: r.category || null, createdAt: r.created_at, updatedAt: r.updated_at,
});
const getProduct = async (env, id) => row(await env.DB.prepare(SEL + ' WHERE p.id = ?').bind(id).first());

async function saveImage(env, file) {
  if (!file || typeof file === 'string' || !file.size) return null;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('사진은 PNG, JPG, WEBP, GIF만 올릴 수 있어요.');
  if (file.size > MAX_IMAGE) throw new Error('사진은 2MB 이하로 올려 주세요.');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[file.type];
  const key = `u/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return '/uploads/' + key;
}
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const priceOf = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 && n <= 100000000 ? n : null; };

// ---------- AI 하루 한도 ----------
function kstDay() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
async function takeAi(env, req) {
  const day = kstDay(); const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const up = 'INSERT INTO ai_usage (day, key, count) VALUES (?, ?, 1) ON CONFLICT(day, key) DO UPDATE SET count = count + 1 RETURNING count';
  const [all, mine] = await env.DB.batch([env.DB.prepare(up).bind(day, 'all'), env.DB.prepare(up).bind(day, 'ip:' + ip)]);
  if (mine.results[0].count > AI_LIMIT_IP) return `AI 체험은 한 사람당 하루 ${AI_LIMIT_IP}번까지예요. 내일 다시 써 보세요.`;
  if (all.results[0].count > AI_LIMIT_ALL) return '오늘 준비한 AI 체험 횟수를 모두 썼어요. 내일 다시 써 보세요.';
  return null;
}
async function openai(env, body) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('OpenAI ' + r.status);
  return (await r.json()).choices[0].message.content;
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- 화면 ----------
const PAGES = {
  '/': 'index.html', '/login': 'login.html', '/me': 'me.html', '/products/new': 'product-new.html',
  '/bump/checkout': 'bump-checkout.html', '/payments/success': 'bump-success.html', '/payments/fail': 'bump-fail.html',
};
const page = (env, url, file) => env.ASSETS.fetch(new Request(new URL('/' + file, url)));

async function handle(req, env) {
  const url = new URL(req.url); const path = url.pathname; const m = req.method;
  const me = await readSession(req, env);

  if (path === '/config.js') {
    const js = `window.STAGE=12;window.REGIONS=${JSON.stringify(REGIONS)};window.ME=${JSON.stringify(me)};`
      + "document.write('<link rel=\"stylesheet\" href=\"/mobile.css\">');"
      + `window.CATEGORIES=${JSON.stringify(CATEGORIES)};window.DEMO_ACCOUNTS=${JSON.stringify(DEMO_ACCOUNTS)};window.DEMO_PASSWORD=${JSON.stringify(DEMO_PASSWORD)};`;
    return new Response(js, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (path.startsWith('/uploads/u/')) {
    const obj = await env.IMAGES.get(path.slice('/uploads/'.length));
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' } });
  }
  if (m === 'GET') {
    if (path === '/signup') return redirect('/login');
    if (path === '/logout') return redirect('/', { 'Set-Cookie': clearSession });
    const needLogin = path === '/products/new' || /^\/products\/\d+\/edit$/.test(path) || path === '/bump/checkout';
    if (needLogin && !me) return redirect('/login?next=' + encodeURIComponent(path + url.search));
    if (PAGES[path]) return page(env, url, PAGES[path]);
    if (/^\/products\/\d+\/edit$/.test(path)) return page(env, url, 'product-new.html');
    if (/^\/products\/\d+$/.test(path)) return page(env, url, 'product-detail.html');
    if (/^\/auth\/(kakao|naver|google)$/.test(path)) return redirect('/login?error=' + encodeURIComponent('데모에서는 소셜 로그인을 쓰지 않아요. 체험용 계정으로 로그인해 주세요.'));
  }

  // ---------- 판매글 API ----------
  if (path === '/api/products' && m === 'GET') {
    const pg = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit')) || 20));
    const where = []; const args = [];
    const search = clean(url.searchParams.get('search'), 50).toLowerCase();
    if (search) { where.push('(lower(p.name) LIKE ? OR lower(p.description) LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
    const region = url.searchParams.get('region');
    if (region) { where.push('p.region = ?'); args.push(region); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM products p' + w).bind(...args).first()).n;
    const { results } = await env.DB.prepare(SEL + w + ' ORDER BY COALESCE(p.bumped_at, p.created_at) DESC, p.id DESC LIMIT ? OFFSET ?').bind(...args, limit, (pg - 1) * limit).all();
    return json({ data: results.map(row), meta: { total, page: pg, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  }
  let pm = path.match(/^\/api\/products\/(\d+)$/);
  if (path.match(/^\/api\/products\/[^/]+$/) && !pm) return err(400, '유효한 상품 ID가 아닙니다.');
  if (pm && m === 'GET') {
    const p = await getProduct(env, Number(pm[1]));
    return p ? json(p) : err(404, '상품을 찾을 수 없습니다.');
  }
  if (path === '/api/products' && m === 'POST') {
    if (!me) return err(401, '로그인이 필요합니다.');
    const f = await req.formData();
    const name = clean(f.get('name'), 60); const price = priceOf(f.get('price')); const description = clean(f.get('description'), 2000);
    if (!name || !price || !description) return err(400, '상품명, 가격, 설명은 필수입니다.');
    let imageUrl; try { imageUrl = await saveImage(env, f.get('image')); } catch (e) { return err(400, e.message); }
    const region = REGIONS.includes(f.get('region')) ? f.get('region') : me.region;
    const category = CATEGORIES.includes(f.get('category')) ? f.get('category') : null;
    const r = await env.DB.prepare("INSERT INTO products (name, price, description, image_url, region, status, seller_id, category, updated_at) VALUES (?, ?, ?, ?, ?, '판매중', ?, ?, CURRENT_TIMESTAMP) RETURNING id")
      .bind(name, price, description, imageUrl, region, me.id, category).first();
    return json(await getProduct(env, r.id), 201);
  }
  if (pm && (m === 'PUT' || m === 'DELETE')) {
    const cur = await getProduct(env, Number(pm[1]));
    if (!cur) return err(404, '상품을 찾을 수 없습니다.');
    if (!me) return err(401, '로그인이 필요합니다.');
    if (cur.sellerId !== me.id) return err(403, '판매자 본인만 할 수 있습니다.');
    if (m === 'DELETE') {
      await env.DB.prepare('DELETE FROM payments WHERE product_id = ?').bind(cur.id).run();
      await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(cur.id).run();
      if (cur.imageUrl && cur.imageUrl.startsWith('/uploads/u/')) await env.IMAGES.delete(cur.imageUrl.slice('/uploads/'.length));
      return json({ message: '상품이 삭제되었습니다.' });
    }
    const f = await req.formData();
    const n = { ...cur };
    if (f.get('name')) n.name = clean(f.get('name'), 60);
    if (f.get('price') && priceOf(f.get('price'))) n.price = priceOf(f.get('price'));
    if (f.get('description')) n.description = clean(f.get('description'), 2000);
    if (REGIONS.includes(f.get('region'))) n.region = f.get('region');
    if (STATUSES.includes(f.get('status'))) n.status = f.get('status');
    try { const img = await saveImage(env, f.get('image')); if (img) n.imageUrl = img; } catch (e) { return err(400, e.message); }
    await env.DB.prepare('UPDATE products SET name = ?, price = ?, description = ?, image_url = ?, region = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(n.name, n.price, n.description, n.imageUrl || null, n.region, n.status, cur.id).run();
    return json(await getProduct(env, cur.id));
  }

  // ---------- 회원 API (데모: 가입은 막고 체험용 계정만) ----------
  if (path === '/api/auth/signup' && m === 'POST') return err(403, '데모에서는 회원 가입을 막아 두었어요. 체험용 계정으로 로그인해 주세요.');
  if (path === '/api/auth/login' && m === 'POST') {
    const { username, password } = await req.json().catch(() => ({}));
    const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(clean(username, 40)).first();
    if (!u || !(await checkPassword(String(password || ''), u.password))) return err(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
    const user = { id: u.id, username: u.username, nickname: u.nickname, email: u.email, region: u.region };
    return json({ message: '로그인되었습니다.', user }, 200, { 'Set-Cookie': await makeSession(env, user) });
  }
  if (path === '/api/auth/logout' && m === 'POST') return json({ message: '로그아웃되었습니다.' }, 200, { 'Set-Cookie': clearSession });
  if (path === '/api/auth/me' && m === 'GET') return me ? json(me) : err(401, '로그인이 필요합니다.');

  // ---------- 14장: 끌어올리기 결제(토스페이먼츠 테스트) ----------
  if (path === '/api/bump/order' && m === 'POST') {
    if (!me) return err(401, '로그인이 필요합니다.');
    const body = await req.json().catch(() => ({}));
    const p = await getProduct(env, parseInt(body.productId));
    if (!p) return err(404, '판매글을 찾을 수 없습니다.');
    if (p.sellerId !== me.id) return err(403, '내 판매글만 끌어올릴 수 있습니다.');
    const orderId = 'bump-' + p.id + '-' + Date.now();
    await env.DB.prepare('INSERT INTO payments (order_id, product_id, user_id, item, amount) VALUES (?, ?, ?, ?, ?)').bind(orderId, p.id, me.id, 'bump', PRICES.bump).run();
    return json({ orderId, amount: PRICES.bump, orderName: '끌어올리기 1회: ' + p.name, clientKey: env.TOSS_CLIENT_KEY, customerKey: 'user-' + me.id });
  }
  if (path === '/api/bump/confirm' && m === 'POST') {
    if (!me) return err(401, '로그인이 필요합니다.');
    const body = await req.json().catch(() => ({}));
    const amount = parseInt(body.amount);
    const order = await env.DB.prepare('SELECT * FROM payments WHERE order_id = ?').bind(String(body.orderId || '')).first();
    if (!order) return err(404, '주문을 찾을 수 없습니다.');
    if (order.user_id !== me.id) return err(403, '결제한 사람이 판매자가 아닙니다.');
    const p = await getProduct(env, order.product_id);
    if (!p || p.sellerId !== me.id) return err(403, '내 판매글만 끌어올릴 수 있습니다.');
    if (amount !== PRICES[order.item] || amount !== order.amount) {
      await env.DB.prepare("UPDATE payments SET status = 'REJECTED' WHERE id = ?").bind(order.id).run();
      return err(400, '결제 금액이 가격표와 다릅니다.');
    }
    if (order.status === 'DONE') return json({ ok: true, product: p, amount: order.amount });
    const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST', headers: { Authorization: 'Basic ' + btoa(env.TOSS_SECRET_KEY + ':'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey: body.paymentKey, orderId: order.order_id, amount }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return err(400, j.message || '결제 승인에 실패했습니다.');
    await env.DB.batch([
      env.DB.prepare("UPDATE payments SET payment_key = ?, status = 'DONE', approved_at = CURRENT_TIMESTAMP WHERE id = ?").bind(String(body.paymentKey), order.id),
      env.DB.prepare('UPDATE products SET bumped_at = CURRENT_TIMESTAMP WHERE id = ?').bind(p.id),
    ]);
    return json({ ok: true, product: await getProduct(env, p.id), amount, method: j.method });
  }
  if (path === '/api/payments' && m === 'GET') {
    if (!me) return err(401, '로그인이 필요합니다.');
    const { results } = await env.DB.prepare('SELECT order_id, product_id, item, amount, status, approved_at FROM payments WHERE user_id = ? ORDER BY id DESC').bind(me.id).all();
    return json(results);
  }

  // ---------- 15장: AI 기능(하루 한도) ----------
  if (path === '/api/chat' && m === 'POST') {
    const { message } = await req.json().catch(() => ({}));
    const q = clean(message, 500);
    if (!q) return err(400, '질문을 입력하세요.');
    const limited = await takeAi(env, req); if (limited) return err(429, limited);
    try {
      const answer = await openai(env, {
        model: 'gpt-4o-mini', max_tokens: 400,
        messages: [
          { role: 'system', content: '너는 동네북의 친절한 도우미야. 이용 방법과 안전한 거래 수칙을 안내하고, 모르는 내용은 모른다고 답해. '
            + '아래 안내문을 참고해서 3~5문장으로 짧게 답하고, 특정 거래가 사기인지 단정하지 마. 안내문에 없는 분쟁, 피해, 환불 문의는 데모라 처리할 수 없다고 안내해. '
            + '이 사이트는 책 『AI로 개발하기』의 예제를 체험해 보는 데모라서 실제 거래는 되지 않아.\n\n' + HELP },
          { role: 'user', content: q },
        ],
      });
      return json({ answer });
    } catch (e) { console.error('chat', e.message); return err(500, '답변을 가져오지 못했습니다.'); }
  }
  if (path === '/api/ai/draft' && m === 'POST') {
    if (!me) return err(401, '로그인이 필요합니다.');
    const f = await req.formData(); const file = f.get('image');
    if (!file || typeof file === 'string') return err(400, '사진을 올려 주세요.');
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return err(400, '사진은 PNG, JPG, WEBP, GIF만 올릴 수 있어요.');
    if (file.size > MAX_IMAGE) return err(400, '사진은 2MB 이하로 올려 주세요.');
    const limited = await takeAi(env, req); if (limited) return err(429, limited);
    try {
      const content = await openai(env, {
        model: 'gpt-4o-mini', response_format: { type: 'json_object' }, max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: 'text', text: '이 물건 사진을 보고 중고거래 판매글 초안으로 제목, 카테고리, 설명 3문장을 써줘. 가격은 쓰지 마. '
            + `카테고리는 다음 중 하나로 골라: ${CATEGORIES.join(', ')}. 설명은 사진에서 보이는 것(종류, 색, 모양, 겉보기 상태)만 쓰고, 구입 시기, 사용 기간, 연결 방식, 구성품처럼 사진으로 알 수 없는 내용은 지어내지 마. `
            + 'JSON으로 {"title": "...", "category": "...", "description": "..."} 형식으로만 답해.' },
          { type: 'image_url', image_url: { url: `data:${file.type};base64,${toBase64(await file.arrayBuffer())}` } },
        ] }],
      });
      const d = JSON.parse(content);
      return json({ title: d.title || '', category: CATEGORIES.includes(d.category) ? d.category : '기타', description: d.description || '' });
    } catch (e) { console.error('draft', e.message); return err(500, '초안을 만들지 못했습니다.'); }
  }

  if (path.startsWith('/api/')) return err(404, '없는 주소입니다.');
  return env.ASSETS.fetch(req);
}

// 매일 새벽 4시(한국 시간): 처음 상태로 되돌리고, 방문자가 올린 사진을 지웁니다.
async function reset(env) {
  await env.DB.batch(SEED_SQL.map((s) => env.DB.prepare(s)));
  let cursor;
  do {
    const list = await env.IMAGES.list({ prefix: 'u/', cursor });
    if (list.objects.length) await env.IMAGES.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); } catch (e) { console.error(e); return err(500, '잠시 후 다시 시도해 주세요.'); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(reset(env)); },
};
