(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  // menu mobile
  const mb = $('.menu-btn'), nav = $('#mainnav');
  if (mb && nav) mb.addEventListener('click', () => { const o = nav.classList.toggle('open'); mb.setAttribute('aria-expanded', o); });

  // filtros: fechados no celular por padrão
  const filters = $('.filters');
  if (filters && window.matchMedia('(max-width:900px)').matches && !$('.pill', filters)) filters.open = false;
  if (filters && !window.matchMedia('(max-width:900px)').matches) $('summary', filters).addEventListener('click', (e) => e.preventDefault());
  $$('.js-autosubmit').forEach((s) => s.addEventListener('change', () => s.form.submit()));

  // whatsapp: escolher loja
  const sheet = $('#wa-sheet');
  $$('.js-wa-open').forEach((b) => b.addEventListener('click', () => {
    const units = $$('.wa-unit', sheet);
    if (units.length === 1) { window.open(units[0].href, '_blank', 'noopener'); return; }
    sheet.hidden = false; $('.wa-unit, .wa-close', sheet).focus();
  }));
  if (sheet) {
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.wa-close') || e.target.closest('.wa-unit')) sheet.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.hidden = true; });
  }

  // estatística: cliques em qualquer link de WhatsApp
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="wa.me/"]'); if (!a) return;
    const v = a.dataset.id || (document.querySelector('.sim') ? (location.pathname.match(/\/veiculo\/(\d+)/) || [])[1] : '') || '';
    try { navigator.sendBeacon('/api/evt', new Blob([JSON.stringify({ t: 'wa', v })], { type: 'application/json' })); } catch (_) {}
  });

  // favoritos e comparação (guardados só neste aparelho)
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || '[]').map(Number).filter(Boolean); } catch (_) { return []; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
  const favCount = $('.fav-count'), favLink = $('.fav-link');
  const cmpBar = $('#cmp-bar');
  function paint() {
    const fav = store.get('ss_fav'), cmp = store.get('ss_cmp');
    $$('.js-fav').forEach((b) => { const on = fav.includes(+b.dataset.id); b.setAttribute('aria-pressed', on); b.classList.toggle('on', on); const t = $('span', b); if (t) t.textContent = on ? 'Favorito' : 'Favoritar'; });
    $$('.js-cmp').forEach((b) => { const on = cmp.includes(+b.dataset.id); b.setAttribute('aria-pressed', on); b.classList.toggle('on', on); const t = $('span', b); if (t) t.textContent = on ? 'Comparando' : 'Comparar'; });
    if (favCount) { favCount.textContent = fav.length; favCount.hidden = !fav.length; }
    if (favLink) favLink.href = '/favoritos' + (fav.length ? '?ids=' + fav.join(',') : '');
    if (cmpBar) {
      const onCmpPage = location.pathname === '/comparar';
      cmpBar.hidden = !cmp.length || onCmpPage; $('.js-cmp-n', cmpBar).textContent = cmp.length;
      $('a', cmpBar).href = '/comparar?ids=' + cmp.join(',');
    }
  }
  function flash(msg) {
    let t = $('#toast-site'); if (!t) { t = document.createElement('div'); t.id = 'toast-site'; t.className = 'toast-site'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }
  document.addEventListener('click', (e) => {
    const f = e.target.closest('.js-fav'), c = e.target.closest('.js-cmp'), r = e.target.closest('.js-cmp-remove'), cl = e.target.closest('.js-cmp-clear');
    if (f) {
      e.preventDefault(); const id = +f.dataset.id; let fav = store.get('ss_fav');
      const had = fav.includes(id); fav = had ? fav.filter((x) => x !== id) : [id, ...fav].slice(0, 30);
      store.set('ss_fav', fav); paint(); flash(had ? 'Removido dos favoritos' : 'Salvo nos favoritos ♥');
      if (had && $('.js-favpage')) { const card = f.closest('.card'); if (card) card.remove(); }
    }
    if (c) {
      e.preventDefault(); const id = +c.dataset.id; let cmp = store.get('ss_cmp');
      if (cmp.includes(id)) { cmp = cmp.filter((x) => x !== id); flash('Removido da comparação'); }
      else if (cmp.length >= 3) { flash('Você pode comparar até 3 carros'); return; }
      else { cmp.push(id); flash(cmp.length === 1 ? 'Escolha mais um carro para comparar' : 'Adicionado à comparação'); }
      store.set('ss_cmp', cmp); paint();
    }
    if (r) { const cmp = store.get('ss_cmp').filter((x) => x !== +r.dataset.id); store.set('ss_cmp', cmp); location.href = '/comparar?ids=' + cmp.join(','); }
    if (cl) { store.set('ss_cmp', []); paint(); }
  });
  // páginas de favoritos/comparar sem ids na URL: usa o que está salvo no aparelho
  if ((location.pathname === '/favoritos' || location.pathname === '/comparar') && !new URLSearchParams(location.search).get('ids')) {
    const ids = store.get(location.pathname === '/favoritos' ? 'ss_fav' : 'ss_cmp');
    if (ids.length) location.replace(location.pathname + '?ids=' + ids.join(','));
  }
  if (location.pathname === '/comparar') {
    const ids = (new URLSearchParams(location.search).get('ids') || '').split(',').map(Number).filter(Boolean);
    if (ids.length) store.set('ss_cmp', ids.slice(0, 3));
  }
  paint();

  // aviso de cookies do Google Analytics (só carrega se a pessoa aceitar)
  const consent = $('#consent');
  if (consent) {
    const loadGA = () => {
      const id = consent.dataset.ga, sc = document.createElement('script');
      sc.async = true; sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id); document.head.appendChild(sc);
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', id, { anonymize_ip: true });
    };
    let c = null; try { c = localStorage.getItem('ss_consent'); } catch (_) {}
    if (c === '1') loadGA(); else if (c !== '0') consent.hidden = false;
    $$('.js-consent', consent).forEach((b) => b.addEventListener('click', () => {
      try { localStorage.setItem('ss_consent', b.dataset.v); } catch (_) {}
      consent.hidden = true; if (b.dataset.v === '1') loadGA();
    }));
  }

  // galeria
  const g = $('.gallery-main');
  if (g) {
    const imgs = $$('img', g), thumbs = $$('.thumbs button'), cur = $('.js-gcur');
    const go = (i) => { i = (i + imgs.length) % imgs.length; g.scrollTo({ left: i * g.clientWidth, behavior: 'smooth' }); };
    const idx = () => Math.round(g.scrollLeft / g.clientWidth);
    g.addEventListener('scroll', () => {
      const i = idx(); if (cur) cur.textContent = i + 1;
      thumbs.forEach((t, j) => t.classList.toggle('on', j === i));
    }, { passive: true });
    thumbs.forEach((t) => t.addEventListener('click', () => go(+t.dataset.i)));
    const p = $('.gprev'), n = $('.gnext');
    if (p) p.addEventListener('click', () => go(idx() - 1));
    if (n) n.addEventListener('click', () => go(idx() + 1));
    g.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(idx() + 1); if (e.key === 'ArrowLeft') go(idx() - 1); });
  }

  // tela cheia
  const lb = $('#lightbox');
  if (lb && g) {
    const track = $('.lb-track', lb), lcur = $('.js-lbcur', lb), n = $$('figure', track).length;
    let lastFocus = null;
    const li = () => Math.round(track.scrollLeft / track.clientWidth);
    const lgo = (i, smooth = true) => { i = (i + n) % n; track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' }); };
    const open = (i) => {
      lastFocus = document.activeElement; lb.hidden = false; document.body.classList.add('lb-open');
      requestAnimationFrame(() => { lgo(i, false); if (lcur) lcur.textContent = i + 1; });
      $('.lb-close', lb).focus();
      if (lb.requestFullscreen && window.matchMedia('(pointer:coarse)').matches) lb.requestFullscreen().catch(() => {});
    };
    const close = () => {
      lb.hidden = true; document.body.classList.remove('lb-open');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      const i = li(); g.scrollTo({ left: i * g.clientWidth }); if (lastFocus) lastFocus.focus();
    };
    track.addEventListener('scroll', () => { if (lcur) lcur.textContent = li() + 1; }, { passive: true });
    $$('img', g).forEach((im, i) => im.addEventListener('click', () => open(i)));
    $('.js-zoom').addEventListener('click', () => open(Math.round(g.scrollLeft / g.clientWidth)));
    $('.lb-close', lb).addEventListener('click', close);
    const lp = $('.lb-prev', lb), ln = $('.lb-next', lb);
    if (lp) lp.addEventListener('click', () => lgo(li() - 1));
    if (ln) ln.addEventListener('click', () => lgo(li() + 1));
    track.addEventListener('click', (e) => { if (e.target.tagName === 'FIGURE') close(); });
    document.addEventListener('keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') lgo(li() + 1);
      if (e.key === 'ArrowLeft') lgo(li() - 1);
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !lb.hidden) { /* saiu do modo do sistema, mantém a galeria aberta */ } });
  }

  // simulador
  const sim = $('.sim');
  if (sim) {
    const price = +sim.dataset.price, rate = +sim.dataset.rate / 100;
    const entry = $('.js-entry', sim), out = $('.js-entry-out', sim), res = $('.js-parcela', sim), wa = $('.js-sim-wa', sim);
    const calc = () => {
      const e = +entry.value, n = +($('input[name=prazo]:checked', sim) || {}).value || 48;
      const pv = Math.max(0, price - e);
      const pmt = rate ? pv * rate / (1 - Math.pow(1 + rate, -n)) : pv / n;
      out.textContent = brl(e) + ' (' + Math.round(e / price * 100) + '%)';
      res.textContent = pv ? n + 'x de ' + brl(pmt) : 'À vista';
      if (wa) wa.href = 'https://wa.me/' + wa.dataset.wa + '?text=' + encodeURIComponent(
        'Olá! Fiz uma simulação no site para o ' + wa.dataset.car + ': entrada de ' + brl(e) + ' e ' + n + ' parcelas (aprox. ' + brl(pmt) + '). Podem me passar as condições?');
    };
    entry.addEventListener('input', calc);
    $$('input[name=prazo]', sim).forEach((r) => r.addEventListener('change', calc));
    calc();
  }

  // formulários (troca/avaliação e "me avise")
  $$('.js-lead').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form), ok = $('.form-ok', form), label = btn.textContent;
    const data = Object.fromEntries(new FormData(form)); data.type = form.dataset.type;
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao enviar');
      ok.className = 'form-ok'; ok.hidden = false;
      if (data.type === 'troca') {
        const txt = 'Olá! Acabei de enviar pelo site meu carro para avaliação: ' + data.car_brand + ' ' + data.car_model + ' ' + data.car_year + (data.car_km ? ', ' + data.car_km + ' km' : '') + '. Meu nome é ' + data.name + '.';
        ok.innerHTML = 'Recebemos seus dados! Um consultor vai entrar em contato. ' + (j.whatsapp ? '<br><a class="btn btn-wa" style="margin-top:10px" target="_blank" rel="noopener" href="https://wa.me/' + j.whatsapp + '?text=' + encodeURIComponent(txt) + '">Agilizar pelo WhatsApp</a>' : '');
      } else ok.textContent = form.dataset.ok || 'Recebemos seu contato!';
      $$('input:not([type=hidden]),textarea', form).forEach((i) => { i.value = ''; });
    } catch (err) {
      ok.className = 'form-ok err'; ok.hidden = false; ok.textContent = err.message;
    } finally { btn.disabled = false; btn.textContent = label; }
  }));
})();
