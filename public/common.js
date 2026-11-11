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
      : `<a class="btn" href="/login">로그인</a><a class="btn green" href="/signup">회원 가입</a>`;
  }
  document.body.insertAdjacentHTML('afterbegin', `
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
