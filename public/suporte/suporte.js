(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const mb = (b) => (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  const when = (s) => { if (!s) return 'nunca'; const d = new Date(/Z$|T/.test(s) ? s : s.replace(' ', 'T') + 'Z'); return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const ago = (s) => { if (!s) return ''; const d = new Date(/Z$|T/.test(s) ? s : s.replace(' ', 'T') + 'Z'); const days = Math.floor((Date.now() - d) / 86400e3); return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`; };
  const dur = (sec) => { const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`; };
  const ACTIONS = { login: 'entrou no painel', veiculo_criado: 'cadastrou', veiculo_editado: 'editou', veiculo_excluido: 'excluiu', veiculo_vendido: 'marcou como vendido', veiculo_reservado: 'marcou como reservado', veiculo_disponivel: 'marcou como disponível', exemplos_apagados: 'apagou os exemplos', loja_editada: 'editou a loja', loja_criada: 'adicionou a loja', loja_removida: 'removeu a loja', configuracoes: 'alterou as configurações', usuario_criado: 'criou o usuário', usuario_editado: 'editou o usuário', backup_baixado: 'baixou um backup' };
  let days = 30;

  async function api(path, opts = {}) {
    const r = await fetch('/api/suporte' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('Sessão expirada'); }
    if (!r.ok) throw new Error(j.error || 'Erro');
    return j;
  }
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/login', { method: 'POST', body: { password: e.target.password.value } }); e.target.reset(); load(); }
    catch (err) { const el = $('#login-err'); el.textContent = err.message; el.hidden = false; }
  });
  $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); showLogin(); });
  $('#refresh').addEventListener('click', () => load());
  $('#rp-period').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    days = +b.dataset.d; $$('#rp-period button').forEach((x) => x.classList.toggle('on', x === b)); load();
  });

  function kv(el, rows) { el.innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join(''); }

  function health(s) {
    const c = s.config, st = s.storage, ct = s.content, a = s.activity;
    const diskPct = st.disk ? Math.round((1 - st.disk.free / st.disk.total) * 100) : null;
    const sinceLogin = a.lastLogin ? (Date.now() - new Date(a.lastLogin.replace(' ', 'T') + 'Z')) / 86400e3 : Infinity;
    const checks = [
      [c.adminPasswordSet ? 'ok' : 'bad', c.adminPasswordSet ? 'Senha do painel definida' : 'Painel usando a senha padrão (defina ADMIN_PASSWORD)'],
      [c.sessionSecretSet ? 'ok' : 'warn', c.sessionSecretSet ? 'Segredo de sessão definido' : 'SESSION_SECRET não definido'],
      [c.dataDirSet ? 'ok' : 'bad', c.dataDirSet ? 'Dados em volume persistente' : 'DATA_DIR não definido: dados podem sumir no deploy'],
      [diskPct == null ? 'warn' : diskPct > 90 ? 'bad' : diskPct > 75 ? 'warn' : 'ok', diskPct == null ? 'Uso do disco indisponível' : `Disco do volume ${diskPct}% usado`],
      [s.errors.length ? 'warn' : 'ok', s.errors.length ? `${s.errors.length} erro(s) desde o último reinício` : 'Nenhum erro desde o último reinício'],
      [ct.demo ? 'warn' : 'ok', ct.demo ? `${ct.demo} veículo(s) de exemplo ainda no site` : 'Sem veículos de exemplo'],
      [ct.withoutPhotos ? 'warn' : 'ok', ct.withoutPhotos ? `${ct.withoutPhotos} anúncio(s) sem foto` : 'Todos os anúncios têm foto'],
      [ct.unitsMissingHours ? 'warn' : 'ok', ct.unitsMissingHours ? `${ct.unitsMissingHours} loja(s) sem horário` : 'Horários das lojas preenchidos'],
      [c.siteUrl ? 'ok' : 'warn', c.siteUrl ? 'Endereço do site configurado' : 'Endereço do site não configurado (SEO)'],
      [sinceLogin <= 14 ? 'ok' : 'warn', sinceLogin === Infinity ? 'A loja ainda não entrou no painel' : sinceLogin <= 14 ? 'Loja usando o painel' : `Loja sem entrar no painel ${ago(a.lastLogin)}`]
    ];
    const worst = checks.some(([l]) => l === 'bad') ? 'bad' : checks.some(([l]) => l === 'warn') ? 'warn' : 'ok';
    const label = { ok: 'Tudo certo', warn: 'Precisa de atenção', bad: 'Problema importante' }[worst];
    $('#health').innerHTML = `<div class="health-top"><h2 style="margin:0">Saúde do sistema</h2><span class="pill ${worst}">${label}</span></div>
      <ul class="checks">${checks.map(([l, t]) => `<li class="${l}"><span class="i" aria-hidden="true">${l === 'ok' ? '✓' : l === 'warn' ? '!' : '×'}</span><span><span class="sr">${l === 'ok' ? 'OK: ' : l === 'warn' ? 'Atenção: ' : 'Problema: '}</span>${esc(t)}</span></li>`).join('')}</ul>`;
  }

  async function load() {
    try {
      const { report, system: s } = await api('/resumo?dias=' + days);
      $('#login').hidden = true; $('#app').hidden = false;
      if (s.domain) $('#site-name').textContent = ' · ' + s.domain;
      health(s);
      window.SSReport.render($('#report'), report, { linkVehicles: true });
      const a = s.activity, ct = s.content, st = s.storage;
      kv($('#activity'), [
        ['Último acesso', `${when(a.lastLogin)} <small>${ago(a.lastLogin)}</small>`],
        ['Acessos (30 dias)', num(a.logins30)],
        ['Alterações em carros (30 dias)', num(a.vehicleChanges30)],
        ['Última alteração de anúncio', when(a.lastVehicleChange)],
        ['Usuários ativos (além do admin)', num(ct.users)]
      ]);
      kv($('#content'), [
        ['Carros no site', num(ct.vehicles)], ['Vendidos', num(ct.sold)], ['De exemplo', num(ct.demo)], ['Sem foto', num(ct.withoutPhotos)],
        ['Contatos recebidos (total)', num(ct.leadsTotal)], ['Contatos em aberto', num(ct.leadsOpen)]
      ]);
      kv($('#system'), [
        ['Versão', `${esc(s.version)}${s.commit ? ` · <code>${esc(s.commit)}</code>` : ''}`],
        ['Último deploy', esc(s.commitMessage || '—')],
        ['No ar desde', `${when(s.startedAt)} <small>(${dur(s.uptimeSec)})</small>`],
        ['Node.js', esc(s.node)], ['Memória', s.memoryMB + ' MB'],
        ['Banco de dados', mb(st.dbBytes)], ['Fotos', `${num(st.uploads.files)} · ${mb(st.uploads.bytes)}`],
        ['Disco livre', st.disk ? `${mb(st.disk.free)} de ${mb(st.disk.total)}` : '—'],
        ['Requisições desde o início', `${num(s.requests.total)} <small>(${num(s.requests.s5xx)} erros 5xx, ${num(s.requests.slow)} lentas)</small>`],
        ['Google Analytics', s.config.gaId ? esc(s.config.gaId) : 'não configurado']
      ]);
      $('#audit').innerHTML = a.recent.length ? `<ul class="log">${a.recent.map((r) => `<li><time>${when(r.at)}</time><b>${esc(r.actor)}</b> ${esc(ACTIONS[r.action] || r.action)} ${esc(r.detail)}</li>`).join('')}</ul>` : '<p class="empty">Nenhuma atividade registrada ainda.</p>';
      $('#errors').innerHTML = s.errors.length ? `<ul class="log">${s.errors.map((e) => `<li><time>${when(e.at)}</time><code>${esc(e.path)}</code><br>${esc(e.message)}</li>`).join('')}</ul>` : '<p class="empty">Nenhum erro desde o último reinício. 👍</p>';
    } catch (_) { showLogin(); }
  }
  load();
})();
