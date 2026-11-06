(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const STATUS = { disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido' };

  let STORE = 'a loja';
  let vehicles = [], units = [], editing = null, photos = [], me = null, settingsCache = {};

  async function api(path, opts = {}) {
    const r = await fetch('/api/admin' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('Sessão expirada'); }
    if (!r.ok) throw new Error(j.error || 'Erro');
    return j;
  }
  function toast(msg, bad) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- login ----------
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/login', { method: 'POST', body: { username: e.target.username.value, password: e.target.password.value } }); e.target.password.value = ''; $('#login-err').hidden = true; start(); }
    catch (err) { const el = $('#login-err'); el.textContent = err.message; el.hidden = false; }
  });
  $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); showLogin(); });

  async function start() {
    try {
      const r = await api('/me'); me = r.user; STORE = r.store || STORE; document.title = 'Painel | ' + STORE;
      $('#login').hidden = true; $('#app').hidden = false;
      $('#who').textContent = me.name + (me.role === 'vendedor' ? ' · vendedor' : '');
      $$('.mgr').forEach((x) => { x.hidden = me.role !== 'gerente'; });
      try { settingsCache = await api('/settings'); } catch (_) {}
      const w = $('#warn');
      if (r.defaultPassword) { w.hidden = false; w.textContent = 'Atenção: o painel está usando a senha padrão. Defina a variável ADMIN_PASSWORD no Railway para trocar.'; } else w.hidden = true;
      units = await api('/units');
      $('#unit-select').innerHTML = units.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
      await loadVehicles(); loadLeads();
    } catch (_) { showLogin(); }
  }

  // ---------- tabs ----------
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    if (b.dataset.tab === 'contatos') loadLeads();
    if (b.dataset.tab === 'lojas') renderUnits();
    if (b.dataset.tab === 'config') loadSettings();
    if (b.dataset.tab === 'relatorios') loadReport();
    if (b.dataset.tab === 'usuarios') loadUsers();
  }));

  // ---------- estoque ----------
  async function loadVehicles() {
    vehicles = await api('/vehicles');
    const s = await api('/stats');
    $('#stats').innerHTML = [['Disponíveis', s.available], ['Reservados', s.reserved], ['Vendidos', s.sold], ['Contatos novos', s.newLeads]]
      .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
    $('#demo-box').innerHTML = s.demo && me && me.role === 'gerente' ? `<div class="demo"><span>Há <b>${s.demo}</b> veículos de exemplo no site. Apague quando for cadastrar o estoque real.</span><button class="btn sm danger" id="del-demo">Apagar exemplos</button></div>` : '';
    const dd = $('#del-demo');
    if (dd) dd.addEventListener('click', async () => { if (!confirm('Apagar todos os veículos de exemplo?')) return; await api('/demo', { method: 'DELETE' }); toast('Exemplos apagados'); loadVehicles(); });
    renderVehicles();
  }
  function renderVehicles() {
    const q = $('#vsearch').value.toLowerCase().trim(), f = $('#vfilter').value;
    const list = vehicles.filter((v) => (!f || v.status === f) && (!q || `${v.id} ${v.brand} ${v.model} ${v.version} ${v.year_model}`.toLowerCase().includes(q)));
    const um = Object.fromEntries(units.map((u) => [u.id, u.name]));
    $('#vlist').innerHTML = list.length ? list.map((v) => `<div class="vrow is-${v.status}" data-id="${v.id}">
      <img src="${v.photos[0] ? '/uploads/' + v.photos[0] : '/placeholder/' + v.id + '.svg'}" alt="">
      <div><div class="t">${esc(v.brand)} ${esc(v.model)} ${v.condition === '0km' ? '<span class="tag new">0 km</span>' : ''}${v.featured ? '<span class="tag feat">Destaque</span>' : ''}</div>
        <div class="s">${esc(v.version)} · ${v.year_fab}/${v.year_model} · ${num(v.km)} km · ${esc(um[v.unit_id] || '—')} · #${v.id} · ${v.photos.length} fotos · ${v.views} visitas · ${v.contacts} contatos</div></div>
      <div class="p">${brl(v.price)}</div>
      <div class="a"><select class="st st-${v.status}" aria-label="Situação">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}"${v.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm edit">Editar</button></div>
    </div>`).join('') : '<p class="hint">Nenhum veículo encontrado.</p>';
  }
  $('#vsearch').addEventListener('input', renderVehicles);
  $('#vfilter').addEventListener('change', renderVehicles);
  $('#vlist').addEventListener('click', (e) => {
    const row = e.target.closest('.vrow'); if (!row) return;
    if (e.target.closest('.edit') || e.target.tagName === 'IMG' || e.target.closest('.t')) openEditor(vehicles.find((v) => v.id === +row.dataset.id));
  });
  $('#vlist').addEventListener('change', async (e) => {
    if (!e.target.matches('.st')) return;
    const id = +e.target.closest('.vrow').dataset.id;
    await api('/vehicles/' + id, { method: 'PUT', body: { status: e.target.value } });
    toast('Situação atualizada'); loadVehicles();
  });

  // ---------- editor ----------
  const dlg = $('#editor'), form = $('#vform');
  $('#new-vehicle').addEventListener('click', () => openEditor(null));
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  function openEditor(v) {
    editing = v; form.reset();
    $('#vform-title').textContent = v ? `Editar ${v.brand} ${v.model} (#${v.id})` : 'Cadastrar veículo';
    $('#vdelete').hidden = !v;
    const d = v || { condition: 'seminovo', transmission: 'Automático', fuel: 'Flex', body: 'Hatch', doors: 4, status: 'disponivel', unit_id: units[0] && units[0].id, year_fab: new Date().getFullYear(), year_model: new Date().getFullYear(), options: [], photos: [] };
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = !!d[el.name];
      else if (el.name === 'options') el.value = (d.options || []).join('\n');
      else if (el.name === 'price_old') el.value = d.price_old || '';
      else if (d[el.name] != null) el.value = d[el.name];
    }
    photos = [...(d.photos || [])]; renderPhotos(); $('#upload-status').textContent = '';
    dlg.showModal();
  }
  function renderPhotos() {
    $('#photos').innerHTML = photos.map((p, i) => `<div class="ph" draggable="true" data-i="${i}"><img src="/uploads/${p}" alt="">
      ${i > 0 ? '<button type="button" class="cover-btn" data-a="c">★ Definir capa</button>' : ''}
      <div class="ctl"><button type="button" data-a="l" aria-label="Mover para esquerda">←</button><button type="button" data-a="d" aria-label="Remover">🗑</button><button type="button" data-a="r" aria-label="Mover para direita">→</button></div></div>`).join('');
  }
  $('#photos').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.closest('.ph').dataset.i;
    if (b.dataset.a === 'd') photos.splice(i, 1);
    if (b.dataset.a === 'c') { photos.unshift(photos.splice(i, 1)[0]); toast('Foto definida como capa. Salve o veículo para aplicar.'); }
    if (b.dataset.a === 'l' && i > 0) [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
    if (b.dataset.a === 'r' && i < photos.length - 1) [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]];
    renderPhotos();
  });
  let dragI = null;
  $('#photos').addEventListener('dragstart', (e) => { const p = e.target.closest('.ph'); if (p) { dragI = +p.dataset.i; p.classList.add('drag'); } });
  $('#photos').addEventListener('dragover', (e) => e.preventDefault());
  $('#photos').addEventListener('drop', (e) => {
    e.preventDefault(); const p = e.target.closest('.ph'); if (!p || dragI == null) return;
    const to = +p.dataset.i; const [m] = photos.splice(dragI, 1); photos.splice(to, 0, m); dragI = null; renderPhotos();
  });

  function resize(file, max = 1600, q = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx2 = c.getContext('2d'); ctx2.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        const done = () => resolve(c.toDataURL('image/jpeg', q));
        if (settingsCache.watermark !== '1') return done();
        const wm = new Image();
        wm.onload = () => {
          const w = c.width * 0.22, h = w * wm.height / wm.width, pad = c.width * 0.025;
          ctx2.save(); ctx2.globalAlpha = 0.85; ctx2.shadowColor = 'rgba(0,0,0,.55)'; ctx2.shadowBlur = Math.max(4, c.width / 200);
          ctx2.drawImage(wm, c.width - w - pad, c.height - h - pad, w, h); ctx2.restore(); done();
        };
        wm.onerror = done; wm.src = '/static/img/logo-branca-400.png';
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem ' + file.name));
      img.src = url;
    });
  }
  $('#photo-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files); e.target.value = '';
    const st = $('#upload-status'); let n = 0;
    for (const f of files) {
      st.textContent = `Enviando foto ${++n} de ${files.length}…`;
      try { const data = await resize(f); const r = await api('/upload', { method: 'POST', body: { data } }); photos.push(r.file); renderPhotos(); }
      catch (err) { toast(err.message, true); }
    }
    st.textContent = files.length ? `${files.length} foto(s) enviada(s). Lembre de salvar o veículo.` : '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const el of form.elements) { if (!el.name) continue; body[el.name] = el.type === 'checkbox' ? el.checked : el.value; }
    body.options = body.options.split('\n'); body.photos = photos;
    $('#vsave').disabled = true;
    try {
      const saved = editing ? await api('/vehicles/' + editing.id, { method: 'PUT', body }) : await api('/vehicles', { method: 'POST', body });
      dlg.close(); toast('Veículo salvo'); loadVehicles();
      if (saved.matches && saved.matches.length) showMatches(saved, saved.matches);
    } catch (err) { toast(err.message, true); } finally { $('#vsave').disabled = false; }
  });
  $('#vdelete').addEventListener('click', async () => {
    if (!editing || !confirm(`Excluir ${editing.brand} ${editing.model} definitivamente? Se ele foi vendido, prefira marcar como "Vendido".`)) return;
    await api('/vehicles/' + editing.id, { method: 'DELETE' }); dlg.close(); toast('Veículo excluído'); loadVehicles();
  });

  function waTo(phone, text) { const p = String(phone).replace(/\D/g, ''); return 'https://wa.me/' + (p.length <= 11 ? '55' + p : p) + (text ? '?text=' + encodeURIComponent(text) : ''); }
  function showMatches(v, list) {
    const link = location.origin + '/veiculo/' + v.id;
    $('#matches-body').innerHTML = `<p>${list.length === 1 ? 'Um cliente pediu' : list.length + ' clientes pediram'} para ser avisado quando chegasse um carro assim. Avise agora:</p>` +
      list.map((m) => `<div class="lead novo"><strong>${esc(m.name)} · ${esc(m.phone)}</strong><div class="lead-actions">
        <a class="btn sm primary" target="_blank" rel="noopener" href="${waTo(m.phone, `Olá, ${m.name.split(' ')[0]}! Aqui é da ${STORE}. Chegou o carro que você procurava: ${v.brand} ${v.model} ${v.version} ${v.year_fab}/${v.year_model}. Veja: ${link}`)}">Avisar no WhatsApp</a></div></div>`).join('') +
      '<p class="hint">Depois de avisar, marque o pedido como atendido na aba Contatos.</p>';
    $('#matches-dlg').showModal();
  }
  $$('#matches-dlg [data-close]').forEach((b) => b.addEventListener('click', () => $('#matches-dlg').close()));

  // ---------- contatos ----------
  async function loadLeads() {
    const leads = await api('/leads');
    $('#leads-dot').hidden = !leads.some((l) => l.status === 'novo');
    const um = Object.fromEntries(units.map((u) => [u.id, u.name]));
    $('#leads').innerHTML = leads.length ? leads.map((l) => {
      const d = JSON.parse(l.data || '{}'); const phone = String(l.phone).replace(/\D/g, '');
      const wa = 'https://wa.me/' + (phone.length <= 11 ? '55' + phone : phone);
      return `<div class="lead ${l.status}" data-id="${l.id}">
        <div class="lead-top"><strong>${esc(l.name)} · ${esc(l.phone)}</strong><span class="hint">${new Date(l.created_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR')} · ${esc(um[l.unit_id] || '')}</span></div>
        ${d.car_brand ? `<div>Carro para avaliação: <b>${esc(d.car_brand)} ${esc(d.car_model)} ${esc(d.car_year)}</b>${d.car_km ? ` · ${esc(d.car_km)} km` : ''}</div>` : ''}
        ${l.type === 'alerta' ? `<div><span class="tag new">Me avise</span> Procura: <b>${esc(d.wish || '')}</b>${+d.max_price ? ` · até ${brl(d.max_price)}` : ''}</div>
          ${l.matches && l.matches.length ? `<div class="match-box">Já tem no estoque: ${l.matches.map((m) => `<a href="${m.url}" target="_blank">${esc(m.title)}</a>`).join(', ')}</div>` : ''}` : ''}
        ${l.brand ? `<div>Interesse em: <b>${esc(l.brand)} ${esc(l.model)} ${l.year_model}</b> (#${l.vehicle_id})</div>` : ''}
        ${l.message ? `<div class="hint">${esc(l.message)}</div>` : ''}
        <div class="lead-actions"><a class="btn sm primary" href="${l.matches && l.matches.length ? waTo(l.phone, `Olá, ${String(l.name).split(' ')[0]}! Aqui é da ${STORE}. Chegou um carro como você procurava: ${l.matches[0].title}. Veja: ${location.origin}${l.matches[0].url}`) : wa}" target="_blank" rel="noopener">${l.matches && l.matches.length ? 'Avisar que chegou' : 'Responder no WhatsApp'}</a>
        <button class="btn sm" data-a="toggle">${l.status === 'novo' ? 'Marcar como atendido' : 'Marcar como novo'}</button>
        <button class="btn sm danger" data-a="del">Excluir</button></div>
      </div>`;
    }).join('') : '<p class="hint">Nenhum contato ainda. Os pedidos de avaliação e de aviso ("me avise quando chegar") aparecem aqui.</p>';
  }
  $('#leads').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const el = b.closest('.lead'), id = el.dataset.id;
    if (b.dataset.a === 'toggle') await api('/leads/' + id, { method: 'PUT', body: { status: el.classList.contains('novo') ? 'atendido' : 'novo' } });
    if (b.dataset.a === 'del') { if (!confirm('Excluir este contato?')) return; await api('/leads/' + id, { method: 'DELETE' }); }
    loadLeads();
  });

  // ---------- lojas ----------
  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  function schedRows(raw) {
    let a; try { a = JSON.parse(raw || ''); } catch (_) { a = null; }
    if (!Array.isArray(a) || a.length !== 7) a = Array(7).fill(null);
    return a.map((d, i) => `<div class="sched-row" data-i="${i}">
      <label class="check"><input type="checkbox" class="s-open"${d ? ' checked' : ''}> ${DAYS[i]}</label>
      <input type="time" class="s-from" value="${d ? d.open : '08:00'}" aria-label="${DAYS[i]}: abre às"${d ? '' : ' disabled'}>
      <span>às</span>
      <input type="time" class="s-to" value="${d ? d.close : '18:00'}" aria-label="${DAYS[i]}: fecha às"${d ? '' : ' disabled'}>
      <span class="s-closed"${d ? ' hidden' : ''}>Fechado</span>
    </div>`).join('');
  }
  function readSched(form) {
    return $$('.sched-row', form).map((r) => $('.s-open', r).checked ? { open: $('.s-from', r).value, close: $('.s-to', r).value } : null);
  }
  function renderUnits() {
    $('#units').innerHTML = units.map((u) => `<form class="card" data-id="${u.id}">
      <label>Nome<input name="name" value="${esc(u.name)}"></label>
      <label>Endereço<input name="address" value="${esc(u.address)}"></label>
      <label>Bairro<input name="neighborhood" value="${esc(u.neighborhood)}"></label>
      <label>Cidade - UF<input name="city" value="${esc(u.city)}"></label>
      <label>Telefone<input name="phone" value="${esc(u.phone)}"></label>
      <label>WhatsApp (55 + DDD + número)<input name="whatsapp" value="${esc(u.whatsapp)}" inputmode="numeric"></label>
      <fieldset class="sched"><legend>Horário de funcionamento</legend>${schedRows(u.hours_json)}
        <div class="sched-tools"><button type="button" class="btn sm" data-copy>Copiar horário de segunda para os dias úteis</button></div>
        <p class="hint sched-preview">No site: <b>${esc(u.hours || '—')}</b></p></fieldset>
      <button class="btn primary" type="submit">Salvar ${esc(u.name)}</button>
      ${units.length > 1 ? `<button class="btn danger" type="button" data-remove-unit="${u.id}">Remover esta loja</button>` : ''}
    </form>`).join('');
  }
  $('#units').addEventListener('change', (e) => {
    if (!e.target.matches('.s-open')) return;
    const r = e.target.closest('.sched-row'), on = e.target.checked;
    $('.s-from', r).disabled = !on; $('.s-to', r).disabled = !on; $('.s-closed', r).hidden = on;
  });
  function refreshUnitSelect() { $('#unit-select').innerHTML = units.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); }
  $('#add-unit').addEventListener('click', async () => {
    try { const u = await api('/units', { method: 'POST' }); units.push(u); refreshUnitSelect(); renderUnits(); toast('Loja adicionada. Preencha os dados e salve.'); }
    catch (err) { toast(err.message, true); }
  });
  $('#units').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-unit]');
    if (rm) {
      const u = units.find((x) => x.id === +rm.dataset.removeUnit);
      if (!confirm(`Remover a loja "${u.name}"? Os carros dela passam para outra loja.`)) return;
      api('/units/' + u.id, { method: 'DELETE' }).then(() => { units = units.filter((x) => x.id !== u.id); refreshUnitSelect(); renderUnits(); toast('Loja removida'); loadVehicles(); }).catch((err) => toast(err.message, true));
      return;
    }
    if (!e.target.matches('[data-copy]')) return;
    const rows = $$('.sched-row', e.target.closest('form')), src = rows[0];
    rows.slice(1, 5).forEach((r) => {
      $('.s-open', r).checked = $('.s-open', src).checked; $('.s-from', r).value = $('.s-from', src).value; $('.s-to', r).value = $('.s-to', src).value;
      $('.s-open', r).dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  $('#units').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target.dataset.id; const body = Object.fromEntries(new FormData(e.target));
    body.hours_json = readSched(e.target);
    let u; try { u = await api('/units/' + id, { method: 'PUT', body }); } catch (err) { toast(err.message, true); return; }
    $('.sched-preview b', e.target).textContent = u.hours || '—';
    units = units.map((x) => (x.id === u.id ? u : x));
    $('#unit-select').innerHTML = units.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    toast('Loja salva');
  });

  // ---------- configurações ----------
  async function loadSettings() {
    const s = await api('/settings');
    settingsCache = s;
    for (const el of $('#settings').elements) { if (!el.name || s[el.name] == null) continue; if (el.type === 'checkbox') el.checked = s[el.name] === '1'; else el.value = s[el.name]; }
  }
  $('#settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target)); body.watermark = e.target.watermark.checked ? '1' : '0';
    settingsCache = await api('/settings', { method: 'PUT', body });
    toast('Configurações salvas');
  });

  // ---------- relatórios ----------
  let rpDays = 30;
  async function loadReport() {
    try { const d = await api('/report?dias=' + rpDays); window.SSReport.render($('#report'), d, { linkVehicles: true }); }
    catch (err) { $('#report').innerHTML = '<p class="hint">' + esc(err.message) + '</p>'; }
  }
  $('#rp-period').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    rpDays = +b.dataset.d; $$('#rp-period button').forEach((x) => x.classList.toggle('on', x === b)); loadReport();
  });

  // ---------- usuários ----------
  async function loadUsers() {
    const list = await api('/users');
    $('#users').innerHTML = list.length ? list.map((u) => `<div class="vrow user-row${u.active ? '' : ' is-vendido'}" data-id="${u.id}">
      <div class="avatar">${esc(u.name.slice(0, 1).toUpperCase())}</div>
      <div><div class="t">${esc(u.name)} <span class="tag">${u.role}</span>${u.active ? '' : ' <span class="tag">desativado</span>'}</div>
        <div class="s">usuário: <b>${esc(u.username)}</b> · último acesso: ${u.last_login ? new Date(u.last_login.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : 'nunca'}</div></div>
      <div class="a"><button class="btn sm" data-a="pw">Nova senha</button>
        <button class="btn sm" data-a="role">${u.role === 'gerente' ? 'Tornar vendedor' : 'Tornar gerente'}</button>
        <button class="btn sm ${u.active ? 'danger' : ''}" data-a="active">${u.active ? 'Desativar' : 'Reativar'}</button></div>
    </div>`).join('') : '<p class="hint">Nenhum usuário criado ainda. Por enquanto só o acesso principal "admin" existe.</p>';
    $('#users')._list = list;
  }
  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); toast('Acesso criado'); loadUsers(); }
    catch (err) { toast(err.message, true); }
  });
  $('#users').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const id = +b.closest('.vrow').dataset.id, u = $('#users')._list.find((x) => x.id === id);
    try {
      if (b.dataset.a === 'pw') { const pw = prompt('Nova senha para ' + u.name + ' (mínimo 6 caracteres):'); if (!pw) return; await api('/users/' + id, { method: 'PUT', body: { password: pw } }); toast('Senha alterada'); }
      if (b.dataset.a === 'role') await api('/users/' + id, { method: 'PUT', body: { role: u.role === 'gerente' ? 'vendedor' : 'gerente' } });
      if (b.dataset.a === 'active') await api('/users/' + id, { method: 'PUT', body: { active: !u.active } });
      loadUsers();
    } catch (err) { toast(err.message, true); }
  });

  start();
})();
