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
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const pct = (a, b) => (b ? (a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—');
  const kpi = (l, v, h) => `<div class="rp-kpi"><span class="rp-kl">${esc(l)}</span><b>${v}</b><small>${h || ''}</small></div>`;
  const LEAD = { troca: 'Avaliação de troca', contato: 'Contato', financiamento: 'Financiamento', alerta: 'Me avise quando chegar' };
  const ACTIONS = { cobranca: 'mudou a cobrança:', login: 'entrou no painel', veiculo_criado: 'cadastrou', veiculo_editado: 'editou', veiculo_excluido: 'excluiu', veiculo_vendido: 'marcou como vendido', veiculo_reservado: 'marcou como reservado', veiculo_disponivel: 'marcou como disponível', exemplos_apagados: 'apagou os exemplos', loja_editada: 'editou a loja', loja_criada: 'adicionou a loja', loja_removida: 'removeu a loja', configuracoes: 'alterou as configurações', usuario_criado: 'criou o usuário', usuario_editado: 'editou o usuário', backup_baixado: 'baixou um backup' };
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
    const btn = e.target.querySelector('button[type=submit]'); if (btn.disabled) return; btn.disabled = true;
    try { await api('/login', { method: 'POST', body: { username: e.target.username.value.trim(), password: e.target.password.value } }); e.target.reset(); $('#login-err').hidden = true; load(); }
    catch (err) { const el = $('#login-err'); el.textContent = err.message; el.hidden = false; }
    finally { btn.disabled = false; }
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
      [c.adminLoginBlocked ? 'bad' : c.adminPasswordSet ? 'ok' : 'bad', c.adminLoginBlocked ? 'Acesso principal do painel bloqueado: ADMIN_PASSWORD ausente ou fraca' : c.adminPasswordSet ? 'Senha do painel definida' : 'Painel usando a senha padrão (defina ADMIN_PASSWORD)'],
      [s.latency.p95 == null || s.latency.p95 < 800 ? 'ok' : 'warn', s.latency.p95 == null ? 'Sem medições de tempo de resposta ainda' : `Tempo de resposta: metade abaixo de ${s.latency.p50} ms, 95% abaixo de ${s.latency.p95} ms`],
      [s.billing.status === 'ok' ? 'ok' : s.billing.status === 'aviso' ? 'warn' : 'bad', s.billing.status === 'ok' ? 'Cobrança em dia' : s.billing.status === 'aviso' ? 'Loja com aviso de mensalidade em atraso' : (s.billing.autoSuspended ? 'Site suspenso automaticamente (prazo do aviso venceu)' : 'Site suspenso por cobrança')],
      [c.dataDirSet ? 'ok' : 'bad', c.dataDirSet ? 'Dados em volume persistente' : 'DATA_DIR não definido: dados podem sumir no deploy'],
      [diskPct == null ? 'warn' : diskPct > 90 ? 'bad' : diskPct > 75 ? 'warn' : 'ok', diskPct == null ? 'Uso do disco indisponível' : `Disco do volume ${diskPct}% usado`],
      [s.errorsSinceStart ? 'warn' : 'ok', s.errorsSinceStart ? `${s.errorsSinceStart} erro(s) desde o último reinício` : 'Nenhum erro desde o último reinício'],
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
      const { report, system: s, usage: u, vehicles: vr } = await api('/resumo?dias=' + days);
      $('#login').hidden = true; $('#app').hidden = false;
      if (s.domain) $('#site-name').textContent = ' · ' + s.domain;
      health(s);
      renderServer(u, s); renderBusiness(u, vr); renderVehicles(vr); renderUsage(u); loadUsers(); loadBilling();
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
  function renderServer(u, s) {
    const v = u.server;
    $('#server').innerHTML = `<div class="rp-kpis kpis6">
        ${kpi('Requisições', num(v.requests), `${num(Math.round(v.requests / u.days))} por dia em média`)}
        ${kpi('Tempo médio', v.avgMs + ' ms', s.latency.p95 != null ? `agora: 95% abaixo de ${s.latency.p95} ms` : '')}
        ${kpi('Sem erro', v.uptimePct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%', `${num(v.errors)} respostas com erro 5xx`)}
        ${kpi('Respostas lentas', num(v.slow), 'acima de 1,5 s')}
        ${kpi('Não encontrados', num(v.notFound), 'respostas 4xx (links quebrados, robôs)')}
        ${kpi('Reinícios', num(v.restarts), 'deploys ou quedas do servidor')}
      </div>
      <div class="rp-charts" style="margin-top:12px">
        ${SSReport.bars(u.series, 'requests', 'Requisições por dia')}
        ${SSReport.bars(u.series, 'avgMs', 'Tempo médio de resposta por dia (ms)')}
      </div>`;
    SSReport.bindTips($('#server'), u.series, [['Requisições', 'requests'], ['Tempo médio (ms)', 'avgMs'], ['Erros 5xx', 'errors'], ['Lentas', 'slow'], ['Reinícios', 'restarts']]);
  }

  function renderBusiness(u, vr) {
    const b = u.business, f = u.funnel;
    const steps = [['Visitaram o site', f.visitors], ['Abriram algum anúncio', f.vehicleViewers], ['Entraram em contato', f.contacts]];
    const max = Math.max(1, ...steps.map((x) => x[1]));
    $('#business').innerHTML = `<div class="rp-kpis kpis6">
        ${kpi('Carros no estoque', num(b.stockCount), `${brl(b.stockValue)} em estoque`)}
        ${kpi('Preço médio', brl(b.avgPrice), `há ${num(b.avgAgeDays)} dias no site, em média`)}
        ${kpi('Vendidos no período', num(b.sold), b.avgDaysToSell != null ? `levam ~${num(b.avgDaysToSell)} dias para vender` : 'marcados como vendidos no painel')}
        ${kpi('Cadastrados no período', num(b.listed), `${num(b.reserved)} reservados`)}
        ${kpi('Contatos', num(f.contacts), `WhatsApp, ligações e formulários`)}
        ${kpi('Compartilhamentos', num(f.shares), (vr.shareChannels || []).map((c) => `${num(c.n)} ${esc(({ whatsapp: 'WhatsApp', facebook: 'Facebook', copiar: 'link', nativo: 'celular' })[c.key] || c.key)}`).join(' · ') || 'nenhum ainda')}
      </div>
      <div class="cols two" style="margin-top:12px">
        <div class="box"><h2>Funil do site</h2><ul class="funnel">${steps.map(([l, n], i) => `<li><span>${esc(l)}</span><span class="rp-track"><span style="width:${(n / max * 100).toFixed(1)}%"></span></span><b>${num(n)}${i ? ` <small>${pct(n, steps[i - 1][1])}</small>` : ''}</b></li>`).join('')}</ul></div>
        <div class="box"><h2>Formulários recebidos</h2>${b.leadTypes.length ? `<table class="mini"><tbody>${b.leadTypes.map((l) => `<tr><td>${esc(LEAD[l.key] || l.key)}</td><td class="r"><b>${num(l.n)}</b></td></tr>`).join('')}<tr><td>Marcados como atendidos</td><td class="r">${num(b.leadsAnswered)} <small>(${pct(b.leadsAnswered, b.leadsTotal)})</small></td></tr></tbody></table>` : '<p class="empty">Nenhum formulário no período.</p>'}</div>
      </div>`;
  }

  function renderVehicles(vr) {
    const t = vr.totals;
    $('#vehicles').innerHTML = `<div class="rp-kpis">
        ${kpi('Visitas aos anúncios', num(t.views), `${num(t.people)} pessoas diferentes`)}
        ${kpi('Contatos', num(t.contacts), `${num(t.whatsapp)} WhatsApp · ${num(t.calls)} ligações · ${num(t.forms)} formulários`)}
        ${kpi('Compartilhamentos', num(t.shares), '')}
        ${kpi('Conversão', pct(t.contacts, t.people), 'pessoas que viram e chamaram')}
      </div>
      <div class="rp-card" style="margin-top:12px"><h3>Anúncios mais vistos</h3>${vr.top.length ? `<div class="rp-tablewrap"><table class="rp-table"><thead><tr><th>Veículo</th><th class="r">Preço</th><th class="r">Visitas</th><th class="r">Pessoas</th><th class="r">Compart.</th><th class="r">Contatos</th><th class="r">Conversão</th></tr></thead><tbody>
        ${vr.top.map((v) => `<tr><td><a href="/veiculo/${v.id}" target="_blank">${esc(v.brand)} ${esc(v.model)} ${v.year_model}</a> <small>#${v.id}${v.status === 'vendido' ? ' · vendido' : ` · ${v.daysListed}d no site`}</small></td><td class="r">${brl(v.price)}</td><td class="r">${num(v.views)}</td><td class="r">${num(v.people)}</td><td class="r">${num(v.shares)}</td><td class="r">${num(v.contacts)}</td><td class="r">${pct(v.contacts, v.people)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="rp-empty">Ainda sem visitas a anúncios neste período.</p>'}</div>`;
  }

  function renderUsage(u) {
    $('#roles').innerHTML = `<table class="mini"><thead><tr><th>Perfil</th><th class="r">Usuários</th><th class="r">Ativos</th><th class="r">Acessos</th><th class="r">Ações</th></tr></thead><tbody>
      ${u.roles.map((r) => `<tr><td>${esc(r.label)}</td><td class="r">${num(r.users)}</td><td class="r">${num(r.activeUsers)}</td><td class="r">${num(r.logins)}</td><td class="r">${num(r.actions)}</td></tr>`).join('')}
      </tbody></table><p class="empty" style="margin-top:8px">"Ativos" = entraram no painel no período. O acesso principal conta como gerente.</p>`;
    $('#people').innerHTML = u.users.length ? `<table class="mini"><thead><tr><th>Usuário</th><th>Perfil</th><th class="r">Acessos</th><th class="r">Ações</th><th class="r">Último uso</th></tr></thead><tbody>
      ${u.users.map((x) => `<tr><td>${esc(x.actor)}</td><td>${esc(x.role)}</td><td class="r">${num(x.logins)}</td><td class="r">${num(x.actions)}</td><td class="r">${ago(x.last)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">Ninguém usou o painel neste período.</p>';
  }

  // pede a nova senha numa caixa própria (o prompt() do navegador põe maiúscula automática no celular)
  function askPassword(name) {
    return new Promise((resolve) => {
      const dlg = document.getElementById('pw-dialog'), f = document.getElementById('pw-form');
      document.getElementById('pw-title').textContent = 'Nova senha para ' + name;
      f.pw.value = '';
      const done = (v) => { f.onsubmit = null; document.getElementById('pw-cancel').onclick = null; dlg.close(); resolve(v); };
      f.onsubmit = (e) => { e.preventDefault(); const v = f.pw.value.trim(); if (v.length < 6) { f.pw.setCustomValidity('Mínimo de 6 caracteres'); f.pw.reportValidity(); f.pw.setCustomValidity(''); return; } done(v); };
      document.getElementById('pw-cancel').onclick = () => done(null);
      dlg.oncancel = () => done(null);
      dlg.showModal(); f.pw.focus();
    });
  }
  // ---------- cobrança: normal / aviso / suspenso ----------
  let billDefaults = {};
  function paintBilling(b) {
    billDefaults = b.defaults || billDefaults;
    const f = $('#bill-form');
    f.querySelector(`input[name=status][value=${b.status}]`).checked = true;
    f.deadline.value = b.deadline || ''; f.message.value = b.message || ''; f.showContacts.checked = b.showContacts !== false;
    syncBillForm();
    const pill = $('#bill-pill'), eff = b.effective;
    pill.className = 'pill ' + (eff === 'ok' ? 'ok' : eff === 'aviso' ? 'warn' : 'bad');
    pill.textContent = eff === 'ok' ? 'Em dia' : eff === 'aviso' ? 'Aviso de atraso' + (b.deadline ? ` · suspende após ${b.deadline.split('-').reverse().join('/')}` : '') : (b.autoSuspended ? 'Suspenso (prazo venceu)' : 'Suspenso');
  }
  function syncBillForm() {
    const f = $('#bill-form'), st = (f.querySelector('input[name=status]:checked') || {}).value;
    $('.bdeadline').hidden = st !== 'aviso';
    f.message.placeholder = billDefaults[st] || 'Sem mensagem: nada aparece para a loja.';
    f.message.disabled = st === 'ok';
  }
  async function loadBilling() { try { paintBilling(await api('/billing')); } catch (_) {} }
  $('#bill-form').addEventListener('change', (e) => { if (e.target.name === 'status') syncBillForm(); });
  $('#bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, st = f.querySelector('input[name=status]:checked').value;
    if (st === 'suspenso' && !confirm('Suspender agora? O site sai do ar para os visitantes e o painel da loja fica bloqueado. Nada é apagado e dá para reativar a qualquer momento.')) return;
    try {
      const b = await api('/billing', { method: 'PUT', body: { status: st, deadline: f.deadline.value, message: st === 'ok' ? '' : f.message.value, showContacts: f.showContacts.checked } });
      paintBilling(b);
      $('#bill-msg').textContent = { ok: 'Site e painel liberados.', aviso: 'Aviso ativado no painel da loja.', suspenso: 'Site suspenso.' }[b.effective];
      setTimeout(() => { $('#bill-msg').textContent = ''; }, 5000);
      load();
    } catch (err) { $('#bill-msg').textContent = err.message; }
  });

  // ---------- usuários do painel da loja ----------
  let rolesInfo = {}, usersList = [];
  const roleLabel = (r) => (rolesInfo[r] || {}).label || r;
  const toastU = (msg, bad) => { const el = $('#user-err'); el.textContent = msg; el.hidden = false; el.className = bad ? 'err' : 'ok-msg'; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 4000); };
  async function loadUsers() {
    try {
      if (!Object.keys(rolesInfo).length) {
        rolesInfo = (await api('/roles')).roles;
        $('#role-select').innerHTML = Object.keys(rolesInfo).map((k) => `<option value="${k}"${k === 'vendedor' ? ' selected' : ''} title="${esc(rolesInfo[k].description)}">${esc(rolesInfo[k].label)}</option>`).join('');
      }
      usersList = await api('/users');
      $('#users').innerHTML = usersList.length ? `<div class="rp-tablewrap"><table class="mini users-t"><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Último acesso</th><th></th></tr></thead><tbody>
        ${usersList.map((u) => `<tr data-id="${u.id}" class="${u.active ? '' : 'off'}"><td><b>${esc(u.name)}</b>${u.active ? '' : ' <small>(desativado)</small>'}</td><td><code>${esc(u.username)}</code></td>
          <td><select class="role-pick" aria-label="Perfil de ${esc(u.name)}">${Object.keys(rolesInfo).map((k) => `<option value="${k}"${u.role === k ? ' selected' : ''}>${esc(rolesInfo[k].label)}</option>`).join('')}</select></td>
          <td>${u.last_login ? `${when(u.last_login)} <small>${ago(u.last_login)}</small>` : 'nunca'}</td>
          <td class="r acts"><button type="button" class="sm" data-a="pw">Nova senha</button><button type="button" class="sm ${u.active ? 'danger' : ''}" data-a="active">${u.active ? 'Desativar' : 'Reativar'}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">Nenhum usuário criado ainda. A loja só tem o acesso principal.</p>';
    } catch (err) { $('#users').innerHTML = '<p class="err">' + esc(err.message) + '</p>'; }
  }
  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      const pw = e.target.password.value.trim(), role = roleLabel(e.target.role.value);
      e.target.reset(); $('#role-select').value = 'vendedor';
      toastU(`Acesso criado: usuário "${r.username}" (${role}). Senha inicial: ${pw}`);
      loadUsers();
    } catch (err) { toastU(err.message, true); }
  });
  $('#users').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const id = +b.closest('tr').dataset.id, u = usersList.find((x) => x.id === id);
    try {
      if (b.dataset.a === 'pw') {
        const pw = await askPassword(u.name); if (!pw) return;
        await api('/users/' + id, { method: 'PUT', body: { password: pw } }); toastU(`Senha de ${u.name} alterada para: ${pw} — ele(a) precisa entrar de novo.`);
      }
      if (b.dataset.a === 'active') {
        if (u.active && !confirm(`Desativar o acesso de ${u.name}? Ele(a) sai do painel na hora.`)) return;
        await api('/users/' + id, { method: 'PUT', body: { active: !u.active } }); toastU(`${u.name} ${u.active ? 'desativado(a)' : 'reativado(a)'}.`);
      }
      loadUsers();
    } catch (err) { toastU(err.message, true); }
  });
  $('#users').addEventListener('change', async (e) => {
    if (!e.target.matches('.role-pick')) return;
    const id = +e.target.closest('tr').dataset.id, u = usersList.find((x) => x.id === id);
    try { await api('/users/' + id, { method: 'PUT', body: { role: e.target.value } }); toastU(`${u.name} agora é ${roleLabel(e.target.value)}.`); }
    catch (err) { toastU(err.message, true); }
    loadUsers();
  });

  load();
})();
