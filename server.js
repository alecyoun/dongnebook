// 동네북(동네 중고거래) - 책 8장 캡처용 서버
// STAGE: 1 메모리  2 이미지  3 SQLite(shop.db)  4 조회 API 정리  5 동네북 화면(동네·거래 상태)
//        6 Swagger  7 회원 가입 화면(아직 API 없음)  8 회원 가입/로그인 API  9 판매자 연결 + 소셜 로그인 버튼
require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const STAGE = parseInt(process.env.STAGE || '9', 10);
const PORT = 3000;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const REGIONS = ['역삼동', '삼성동', '대치동', '논현동', '청담동'];
const STATUSES = ['판매중', '예약중', '거래완료'];

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, 'product-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname)),
  }),
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
  limits: { fileSize: 5 * 1024 * 1024 },
});
app.use('/uploads', express.static(uploadsDir));

// ---------- 저장소 ----------
let store;
if (STAGE < 3) {
  let products = []; let nextId = 1;
  store = {
    all: () => products.slice(),
    get: (id) => products.find((p) => p.id === id),
    add: (p) => { const np = { id: nextId++, ...p, createdAt: new Date().toISOString() }; products.push(np); return np; },
    update: (id, p) => { const i = products.findIndex((x) => x.id === id); if (i < 0) return null; products[i] = { ...products[i], ...p }; return products[i]; },
    remove: (id) => { const i = products.findIndex((x) => x.id === id); if (i < 0) return false; products.splice(i, 1); return true; },
  };
} else {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(__dirname, process.env.DB_FILE || 'shop.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  const cols = () => db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (STAGE >= 5) {
    if (!cols().includes('region')) db.exec("ALTER TABLE products ADD COLUMN region TEXT NOT NULL DEFAULT '역삼동'");
    if (!cols().includes('status')) db.exec("ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT '판매중'");
    if (!cols().includes('updated_at')) { db.exec('ALTER TABLE products ADD COLUMN updated_at DATETIME'); db.exec('UPDATE products SET updated_at = created_at'); }
  }
  if (STAGE >= 9 && !cols().includes('seller_id')) db.exec('ALTER TABLE products ADD COLUMN seller_id INTEGER REFERENCES users(id)');
  const row = (r) => {
    if (!r) return r;
    const o = { id: r.id, name: r.name, price: r.price, description: r.description, imageUrl: r.image_url };
    if (STAGE >= 5) { o.region = r.region; o.status = r.status; }
    if (STAGE >= 9) { o.sellerId = r.seller_id; o.sellerNickname = r.seller_nickname || null; }
    o.createdAt = r.created_at;
    if (STAGE >= 5) o.updatedAt = r.updated_at;
    return o;
  };
  const SEL = STAGE >= 9 ? 'SELECT p.*, u.nickname AS seller_nickname FROM products p LEFT JOIN users u ON u.id = p.seller_id' : 'SELECT * FROM products p';
  store = {
    db,
    all: () => db.prepare(SEL + (STAGE >= 5 ? ' ORDER BY p.id DESC' : ' ORDER BY p.id')).all().map(row),
    get: (id) => row(db.prepare(SEL + ' WHERE p.id = ?').get(id)),
    add: (p) => {
      let r;
      if (STAGE >= 9) r = db.prepare("INSERT INTO products (name, price, description, image_url, region, status, seller_id) VALUES (?, ?, ?, ?, ?, '판매중', ?)").run(p.name, p.price, p.description, p.imageUrl || null, p.region || '역삼동', p.sellerId ?? null);
      else if (STAGE >= 5) r = db.prepare("INSERT INTO products (name, price, description, image_url, region, status) VALUES (?, ?, ?, ?, ?, '판매중')").run(p.name, p.price, p.description, p.imageUrl || null, p.region || '역삼동');
      else r = db.prepare('INSERT INTO products (name, price, description, image_url) VALUES (?, ?, ?, ?)').run(p.name, p.price, p.description, p.imageUrl || null);
      if (STAGE >= 5) db.prepare('UPDATE products SET updated_at = created_at WHERE id = ?').run(Number(r.lastInsertRowid));
      return store.get(Number(r.lastInsertRowid));
    },
    update: (id, p) => {
      const cur = store.get(id); if (!cur) return null; const n = { ...cur, ...p };
      if (STAGE >= 5) db.prepare('UPDATE products SET name = ?, price = ?, description = ?, image_url = ?, region = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(n.name, n.price, n.description, n.imageUrl || null, n.region, n.status, id);
      else db.prepare('UPDATE products SET name = ?, price = ?, description = ?, image_url = ? WHERE id = ?').run(n.name, n.price, n.description, n.imageUrl || null, id);
      return store.get(id);
    },
    remove: (id) => db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0,
  };
}

// ---------- 회원(세션) ----------
let db = store.db;
if (STAGE >= 8) {
  const session = require('express-session');
  app.use(session({ secret: process.env.SESSION_SECRET || 'dongnebook-dev-secret', resave: false, saveUninitialized: false }));
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '역삼동',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}
const me = (req) => (req.session && req.session.user) || null;

// ---------- 화면 ----------
const pub = path.join(__dirname, 'public');
app.get('/config.js', (req, res) => {
  res.type('js').send(`window.STAGE=${STAGE};window.REGIONS=${JSON.stringify(REGIONS)};window.ME=${JSON.stringify(me(req))};`);
});
const page = (f) => (req, res) => res.sendFile(path.join(pub, f));
app.get('/', page('index.html'));
const needLogin = (req, res, next) => (STAGE >= 9 && !me(req) ? res.redirect('/login?next=' + encodeURIComponent(req.originalUrl)) : next());
app.get('/products/new', needLogin, page('product-new.html'));
app.get('/products/:id/edit', page(STAGE >= 5 ? 'product-new.html' : 'product-edit.html'));
if (STAGE >= 5) { app.get('/products/:id', page('product-detail.html')); app.get('/me', page('me.html')); }
if (STAGE >= 7) { app.get('/signup', page('signup.html')); app.get('/login', page('login.html')); }
app.use(express.static(pub, { index: false }));

// ---------- 판매글(상품) API ----------
app.get('/api/products', (req, res) => {
  let list = store.all();
  if (STAGE < 4) return res.json(list);
  const pg = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const search = (req.query.search || '').trim().toLowerCase();
  if (search) list = list.filter((p) => p.name.toLowerCase().includes(search) || (p.description || '').toLowerCase().includes(search));
  if (STAGE >= 5 && req.query.region) list = list.filter((p) => p.region === req.query.region);
  const total = list.length; const totalPages = Math.max(1, Math.ceil(total / limit));
  res.json({ data: list.slice((pg - 1) * limit, pg * limit), meta: { total, page: pg, limit, totalPages } });
});
app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: '유효한 상품 ID가 아닙니다.' });
  const p = store.get(id);
  if (!p) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
  res.json(p);
});
const imageMw = STAGE >= 2 ? upload.single('image') : upload.none();
const owner = (req, res, p) => {
  if (STAGE < 9) return true;
  const u = me(req);
  if (!u) { res.status(401).json({ error: '로그인이 필요합니다.' }); return false; }
  if (p.sellerId !== u.id) { res.status(403).json({ error: '판매자 본인만 할 수 있습니다.' }); return false; }
  return true;
};
app.post('/api/products', imageMw, (req, res) => {
  const { name, price, description, region } = req.body;
  if (STAGE >= 9 && !me(req)) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (!name || !price || !description) return res.status(400).json({ error: '상품명, 가격, 설명은 필수입니다.' });
  const p = store.add({ name: name.trim(), price: parseInt(price), description: description.trim(), imageUrl: req.file ? '/uploads/' + req.file.filename : null, region: REGIONS.includes(region) ? region : (me(req)?.region || '역삼동'), sellerId: me(req)?.id });
  console.log('상품 등록:', p.name);
  res.status(201).json(p);
});
app.put('/api/products/:id', imageMw, (req, res) => {
  const id = parseInt(req.params.id);
  const cur = store.get(id);
  if (!cur) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
  if (!owner(req, res, cur)) return;
  const { name, price, description, region, status } = req.body;
  const patch = {};
  if (name) patch.name = name.trim();
  if (price) patch.price = parseInt(price);
  if (description) patch.description = description.trim();
  if (STAGE >= 5 && REGIONS.includes(region)) patch.region = region;
  if (STAGE >= 5 && STATUSES.includes(status)) patch.status = status;
  if (req.file) patch.imageUrl = '/uploads/' + req.file.filename;
  res.json(store.update(id, patch));
});
app.delete('/api/products/:id', (req, res) => {
  const cur = store.get(parseInt(req.params.id));
  if (!cur) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
  if (!owner(req, res, cur)) return;
  store.remove(cur.id);
  res.json({ message: '상품이 삭제되었습니다.' });
});

// ---------- 회원 API ----------
if (STAGE >= 8) {
  const bcrypt = require('bcryptjs');
  const pubUser = (u) => ({ id: u.id, username: u.username, nickname: u.nickname, email: u.email, region: u.region });
  app.post('/api/auth/signup', (req, res) => {
    const { email, username, password, nickname, region } = req.body || {};
    if (!email || !username || !password || !nickname) return res.status(400).json({ error: '이메일, 아이디, 비밀번호, 닉네임은 필수입니다.' });
    if (password.length < 6) return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
    if (db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username)) return res.status(409).json({ error: '이미 사용 중인 이메일 또는 아이디입니다.' });
    const r = db.prepare('INSERT INTO users (email, username, password, nickname, region) VALUES (?, ?, ?, ?, ?)').run(email.trim(), username.trim(), bcrypt.hashSync(password, 10), nickname.trim(), REGIONS.includes(region) ? region : '역삼동');
    res.status(201).json({ message: '회원가입이 완료되었습니다.', user: pubUser(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid))) });
  });
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
    if (!u || !bcrypt.compareSync(password || '', u.password)) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    req.session.user = pubUser(u);
    res.json({ message: '로그인되었습니다.', user: pubUser(u) });
  });
  app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ message: '로그아웃되었습니다.' })); });
  app.get('/api/auth/me', (req, res) => {
    if (!me(req)) return res.status(401).json({ error: '로그인이 필요합니다.' });
    res.json(me(req));
  });
  app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));
}

// ---------- Swagger ----------
if (STAGE >= 6) {
  const swaggerUi = require('swagger-ui-express');
  const P = { type: 'object', properties: { id: { type: 'integer', example: 1 }, name: { type: 'string', example: '무선 키보드' }, price: { type: 'integer', example: 35000 }, description: { type: 'string' }, imageUrl: { type: 'string' }, region: { type: 'string', enum: REGIONS, example: '역삼동' }, status: { type: 'string', enum: STATUSES, example: '판매중' }, createdAt: { type: 'string' }, updatedAt: { type: 'string' } } };
  const idParam = [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: '판매글 번호' }];
  const form = { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'integer' }, description: { type: 'string' }, region: { type: 'string', enum: REGIONS }, status: { type: 'string', enum: STATUSES }, image: { type: 'string', format: 'binary' } } } } } };
  const ok = (d) => ({ 200: { description: d } });
  const doc = {
    openapi: '3.0.0',
    info: { title: '동네북 API', version: '1.0.0', description: '동네북(동네 중고거래)의 판매글 API입니다. [Try it out]을 눌러 직접 요청을 보내 볼 수 있습니다.' },
    servers: [{ url: 'http://localhost:3000', description: '로컬 개발 서버' }],
    tags: [{ name: '판매글', description: '판매글(products) 등록·조회·수정·삭제' }],
    paths: {
      '/api/products': {
        get: { tags: ['판매글'], summary: '판매글 목록 조회', parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }, { name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string', enum: REGIONS } }], responses: ok('판매글 목록(data)과 페이지 정보(meta)') },
        post: { tags: ['판매글'], summary: '판매글 등록', requestBody: form, responses: { 201: { description: '등록된 판매글' } } },
      },
      '/api/products/{id}': {
        get: { tags: ['판매글'], summary: '판매글 한 건 조회', parameters: idParam, responses: ok('판매글') },
        put: { tags: ['판매글'], summary: '판매글 수정(거래 상태 변경 포함)', parameters: idParam, requestBody: form, responses: ok('수정된 판매글') },
        delete: { tags: ['판매글'], summary: '판매글 삭제', parameters: idParam, responses: ok('삭제 완료') },
      },
    },
    components: { schemas: { Product: P } },
  };
  if (STAGE >= 8) {
    doc.info.description = '동네북(동네 중고거래)의 판매글·회원 API입니다. [Try it out]을 눌러 직접 요청을 보내 볼 수 있습니다.';
    doc.tags.push({ name: '회원', description: '회원 가입·로그인' });
    const body = (props) => ({ required: true, content: { 'application/json': { schema: { type: 'object', properties: props } } } });
    doc.paths['/api/auth/signup'] = { post: { tags: ['회원'], summary: '회원 가입', requestBody: body({ email: { type: 'string', example: 'test@example.com' }, username: { type: 'string', example: 'testuser' }, password: { type: 'string', example: 'abc1234' }, nickname: { type: 'string', example: '역삼이웃' }, region: { type: 'string', enum: REGIONS, example: '역삼동' } }), responses: { 201: { description: '회원가입이 완료되었습니다.' } } } };
    doc.paths['/api/auth/login'] = { post: { tags: ['회원'], summary: '로그인', requestBody: body({ username: { type: 'string', example: 'testuser' }, password: { type: 'string', example: 'abc1234' } }), responses: ok('로그인되었습니다.') } };
    doc.paths['/api/auth/logout'] = { post: { tags: ['회원'], summary: '로그아웃', responses: ok('로그아웃되었습니다.') } };
    doc.paths['/api/auth/me'] = { get: { tags: ['회원'], summary: '로그인한 내 정보', responses: ok('내 정보(비밀번호 제외)') } };
    doc.components.schemas.User = { type: 'object', properties: { id: { type: 'integer' }, username: { type: 'string' }, nickname: { type: 'string' }, email: { type: 'string' }, region: { type: 'string', enum: REGIONS } } };
  }
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(doc, { customSiteTitle: '동네북 API 문서' }));
}

if (STAGE >= 9) {
  app.get('/auth/:provider', (req, res, next) => {
    if (!['kakao', 'naver', 'google'].includes(req.params.provider)) return next();
    res.redirect('/login?error=' + encodeURIComponent('소셜 로그인 키가 설정되지 않았습니다. .env 파일을 확인하세요.'));
  });
}

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
