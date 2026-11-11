// src/seed.js(워커가 매일 되돌릴 때 쓰는 SQL)와 src/help.js(도우미 안내문)를 만듭니다.
// 사용: node scripts/build-seed.mjs
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { USERS, PRODUCTS, DEMO_PASSWORD } from './seed-data.mjs';

const root = new URL('..', import.meta.url);
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const ITER = 100000;

const stmts = [
  'DELETE FROM payments',
  'DELETE FROM products',
  'DELETE FROM users',
  "DELETE FROM ai_usage WHERE day < date('now', '-7 days')",
  "DELETE FROM sqlite_sequence WHERE name IN ('products', 'payments', 'users')",
];
for (const u of USERS) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(DEMO_PASSWORD, salt, ITER, 32, 'sha256');
  const stored = `pbkdf2$${ITER}$${salt.toString('base64')}$${hash.toString('base64')}`;
  stmts.push(`INSERT INTO users (id, email, username, password, nickname, region) VALUES (${u.id}, ${q(u.email)}, ${q(u.username)}, ${q(stored)}, ${q(u.nickname)}, ${q(u.region)})`);
}
for (const p of PRODUCTS) {
  const t = `datetime('now', '-${p.ago} minutes')`;
  stmts.push(`INSERT INTO products (name, price, description, image_url, region, status, seller_id, category, created_at, updated_at) VALUES (${q(p.name)}, ${p.price}, ${q(p.description)}, ${q('/uploads-seed/' + p.img + '.png')}, ${q(p.region)}, ${q(p.status)}, ${p.seller}, ${q(p.category)}, ${t}, ${t})`);
}

const accounts = USERS.map(({ username, nickname, region }) => ({ username, nickname, region }));
writeFileSync(new URL('src/seed.js', root),
  '// 자동 생성 파일(scripts/build-seed.mjs). 직접 고치지 마세요.\n'
  + `export const SEED_SQL = ${JSON.stringify(stmts, null, 1)};\n`
  + `export const DEMO_ACCOUNTS = ${JSON.stringify(accounts)};\nexport const DEMO_PASSWORD = ${JSON.stringify(DEMO_PASSWORD)};\n`);
writeFileSync(new URL('seed.sql', root), stmts.join(';\n') + ';\n');

const help = readFileSync(new URL('help.md', root), 'utf8');
writeFileSync(new URL('src/help.js', root), '// 동네북 도우미 안내문(책 15장 help.md)\nexport default ' + JSON.stringify(help) + ';\n');
console.log('seed statements:', stmts.length);
