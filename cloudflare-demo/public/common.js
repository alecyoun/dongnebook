// 공통: 위쪽 메뉴와 작은 도우미 함수
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function won(n) { return Number(n).toLocaleString('ko-KR') + '원'; }
function ago(t) {
  const s = String(t);
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const m = Math.floor((Date.now() - d) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return m + '분 전';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  return Math.floor(h / 24) + '일 전';
}
function regionOptions(sel) { return window.REGIONS.map(r => `<option${r === sel ? ' selected' : ''}>${r}</option>`).join(''); }
function header(active) {
  let right = '';
  if (window.STAGE >= 7) {
    right = window.ME
      ? `<span><b>${esc(window.ME.nickname)}</b> 님</span><a class="btn" href="/logout">로그아웃</a>`
      : `<a class="btn green" href="/login">체험 로그인</a>`;
  }
  document.body.insertAdjacentHTML('afterbegin', `
  <div class="demo-bar"><div class="inner"><span><b>책 『AI로 개발하기』</b>에서 한 단계씩 만드는 예제 서비스예요. 실제 거래는 되지 않고, 매일 새벽 4시에 처음 상태로 돌아가요.</span><a href="https://technote.wiki" target="_blank" rel="noopener">기술노트 알렉 →</a></div></div>
  <header class="header"><div class="inner">
    <a class="logo" href="/"><span class="mark">동</span>동네북</a>
    <nav class="nav">
      <a href="/" class="${active === 'home' ? 'on' : ''}">홈</a>
      <a href="/products/new" class="${active === 'write' ? 'on' : ''}">글쓰기</a>
      <a href="/me" class="${active === 'me' ? 'on' : ''}">내 정보</a>
    </nav>
    <div class="right">${right}</div>
  </div></header>`);
}
// 15장: 오른쪽 아래 '동네북 도우미' 챗봇
if (window.STAGE >= 12) document.addEventListener('DOMContentLoaded', () => {
  document.body.insertAdjacentHTML('beforeend', `
  <button class="chat-fab" id="chatFab">도우미</button>
  <div class="chat" id="chat"><div class="chat-head"><span>동네북 도우미</span><button id="chatX">×</button></div>
    <div class="chat-log" id="chatLog"><div class="bot">안녕하세요, 동네북 도우미예요. 이용 방법이나 안전한 거래가 궁금하면 물어보세요.</div></div>
    <form class="chat-in" id="chatF"><input id="chatQ" placeholder="궁금한 점을 입력하세요" autocomplete="off"><button class="btn green">보내기</button></form>
    <div class="chat-note">AI가 만든 답변입니다. 데모라서 한 사람당 하루 5번까지 쓸 수 있어요.</div></div>`);
  const $c = (i) => document.getElementById(i);
  $c('chatFab').onclick = () => $c('chat').classList.toggle('open');
  $c('chatX').onclick = () => $c('chat').classList.remove('open');
  $c('chatF').onsubmit = async (e) => {
    e.preventDefault();
    const q = $c('chatQ').value.trim(); if (!q) return;
    $c('chatQ').value = '';
    $c('chatLog').insertAdjacentHTML('beforeend', `<div class="me">${esc(q)}</div><div class="bot wait">답변을 준비하고 있어요…</div>`);
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q }) });
    const j = await r.json().catch(() => ({ error: '답변을 가져오지 못했습니다.' }));
    const w = $c('chatLog').querySelector('.wait'); w.classList.remove('wait'); w.textContent = j.answer || j.error;
    $c('chatLog').scrollTop = 1e9;
  };
});
