(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const STATUS = { disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido' };

  let STORE = 'a loja';
  let vehicles = [], units = [], editing = null, photos = [], me = null, settingsCache = {}, perms = [], rolesInfo = {}, permsInfo = {};
  const can = (perm) => perms.includes(perm);

  async function api(path, opts = {}) {
    const r = await fetch('/api/admin' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('Sessão expirada'); }
    if (r.status === 423 && j.suspended) { showSuspended(j.error); throw new Error(j.error); }
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
    const btn = e.target.querySelector('button[type=submit]'); if (btn.disabled) return; btn.disabled = true;
    try { await api('/login', { method: 'POST', body: { username: e.target.username.value.trim(), password: e.target.password.value } }); e.target.password.value = ''; $('#login-err').hidden = true; start(); }
    catch (err) { const el = $('#login-err'); el.textContent = err.message; el.hidden = false; }
    finally { btn.disabled = false; }
  });
  $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); showLogin(); });

  // situação de cobrança (definida pelo suporte)
  function showSuspended(text) {
    $('#suspended-text').textContent = text || '';
    $('#suspended-backup').hidden = !can('backup');
    $('#suspended').hidden = false; $('.tabs').hidden = true;
    $$('[data-panel]').forEach((p) => { p.hidden = true; });
  }
  function showBilling(b) {
    const w = $('#billwarn');
    if (!b || b.status === 'ok') { w.hidden = true; $('#suspended').hidden = true; $('.tabs').hidden = false; return false; }
    if (b.status === 'suspenso') { w.hidden = true; showSuspended(b.text); return true; }
    const d = b.deadline ? new Date(b.deadline + 'T12:00:00').toLocaleDateString('pt-BR') : '';
    w.textContent = b.text + (d ? ` Prazo: ${d}.` : ''); w.hidden = false;
    return false;
  }

  async function start() {
    try {
      const r = await api('/me'); me = r.user; STORE = r.store || STORE; document.title = 'Painel | ' + STORE; perms = r.perms || []; rolesInfo = r.roles || {}; permsInfo = r.permissions || {};
      $('#login').hidden = true; $('#app').hidden = false;
      $('#who').textContent = me.name + ' · ' + ((rolesInfo[me.role] || {}).label || me.role);
      $$('[data-perm]').forEach((x) => { x.hidden = !can(x.dataset.perm); });
      if (showBilling(r.billing)) return; // suspenso: não carrega o resto
      // abre a primeira aba que o perfil pode ver
      const firstTab = $$('.tabs button').find((b) => !b.hidden);
      if (firstTab && !firstTab.classList.contains('on')) firstTab.click();
      try { settingsCache = await api('/settings'); } catch (_) {}
      const w = $('#warn');
      if (r.defaultPassword) { w.hidden = false; w.textContent = 'Atenção: o painel está usando a senha padrão. Defina a variável ADMIN_PASSWORD no Railway para trocar.'; } else w.hidden = true;
      units = await api('/units');
      $('#unit-select').innerHTML = units.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
      if (can('estoque')) await loadVehicles();
      if (can('contatos')) loadLeads();
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
    if (b.dataset.tab === 'desempenho') loadPerf();
  }));

  // ---------- estoque ----------
  async function loadVehicles() {
    vehicles = await api('/vehicles');
    const s = await api('/stats');
    $('#stats').innerHTML = [['Disponíveis', s.available], ['Reservados', s.reserved], ['Vendidos', s.sold], ['Contatos novos', s.newLeads]]
      .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
    $('#demo-box').innerHTML = s.demo && can('estoque_excluir') ? `<div class="demo"><span>Há <b>${s.demo}</b> veículos de exemplo no site. Apague quando for cadastrar o estoque real.</span><button class="btn sm danger" id="del-demo">Apagar exemplos</button></div>` : '';
    const dd = $('#del-demo');
    if (dd) dd.addEventListener('click', async () => { if (!confirm('Apagar todos os veículos de exemplo?')) return; await api('/demo', { method: 'DELETE' }); toast('Exemplos apagados'); loadVehicles(); });
    renderVehicles();
  }
  function renderVehicles() {
    const q = $('#vsearch').value.toLowerCase().trim(), f = $('#vfilter').value;
    const list = vehicles.filter((v) => (!f || v.status === f) && (!q || `${v.id} ${v.brand} ${v.model} ${v.version} ${v.year_model}`.toLowerCase().includes(q)));
    const um = Object.fromEntries(units.map((u) => [u.id, u.name]));
    $('#vlist').innerHTML = list.length ? list.map((v) => `<div class="vrow is-${v.status}" data-id="${v.id}">
      <img src="${v.photos[0] ? '/thumb/' + v.photos[0] : '/placeholder/' + v.id + '.svg'}" alt="" loading="lazy">
      <div><div class="t">${esc(v.brand)} ${esc(v.model)} ${v.condition === '0km' ? '<span class="tag new">0 km</span>' : ''}${v.featured ? '<span class="tag feat">Destaque</span>' : ''}</div>
        <div class="s">${esc(v.version)} · ${v.year_fab}/${v.year_model} · ${num(v.km)} km · ${esc(um[v.unit_id] || '—')} · #${v.id} · ${v.photos.length} fotos · ${num(v.views)} visitas · ${num(v.contacts + (v.calls || 0))} contatos · ${num(v.shares || 0)} compart.</div></div>
      <div class="p">${brl(v.price)}</div>
      <div class="a">${can('estoque_editar') ? `<select class="st st-${v.status}" aria-label="Situação">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}"${v.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="tag st-${v.status}">${STATUS[v.status]}</span>`}
        ${can('desempenho') ? '<button class="btn sm perf" title="Ver desempenho do anúncio">📊</button>' : ''}
        ${can('estoque_editar') ? '<button class="btn sm edit">Editar</button>' : `<a class="btn sm" href="/veiculo/${v.id}" target="_blank">Ver anúncio</a>`}</div>
    </div>`).join('') : '<p class="hint">Nenhum veículo encontrado.</p>';
  }
  $('#vsearch').addEventListener('input', renderVehicles);
  $('#vfilter').addEventListener('change', renderVehicles);
  $('#vlist').addEventListener('click', (e) => {
    const row = e.target.closest('.vrow'); if (!row) return;
    if (e.target.closest('.perf')) return openVehicleStats(+row.dataset.id);
    if (!can('estoque_editar')) { if (can('desempenho') && (e.target.tagName === 'IMG' || e.target.closest('.t'))) openVehicleStats(+row.dataset.id); return; }
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
    $('#vdelete').hidden = !v || !can('estoque_excluir');
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

  // Miniatura (~560px) usada nos cards do estoque. WebP quando o navegador suporta, senão JPEG.
  function makeThumb(src, max = 560) {
    const s = Math.min(1, max / Math.max(src.width, src.height));
    const t = document.createElement('canvas'); t.width = Math.round(src.width * s); t.height = Math.round(src.height * s);
    const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high'; tc.drawImage(src, 0, 0, t.width, t.height);
    const webp = t.toDataURL('image/webp', 0.78);
    return webp.startsWith('data:image/webp') ? webp : t.toDataURL('image/jpeg', 0.78);
  }
  function resize(file, max = 1600, q = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx2 = c.getContext('2d'); ctx2.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        const done = () => resolve({ data: c.toDataURL('image/jpeg', q), thumb: makeThumb(c) });
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
      try { const { data, thumb } = await resize(f); const r = await api('/upload', { method: 'POST', body: { data, thumb } }); photos.push(r.file); renderPhotos(); }
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
  // Gera miniaturas para fotos enviadas antes desta versão
  const thumbBtn = $('#thumbs-btn');
  if (thumbBtn) thumbBtn.addEventListener('click', async () => {
    const st = $('#thumbs-status'); thumbBtn.disabled = true;
    try {
      const list = await api('/thumbs/missing'); let ok = 0;
      if (!list.length) { st.textContent = 'Todas as fotos já têm miniatura.'; return; }
      for (const f of list) {
        st.textContent = `Gerando miniatura ${ok + 1} de ${list.length}…`;
        try {
          const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = '/uploads/' + f; });
          await api('/thumbs', { method: 'POST', body: { file: f, thumb: makeThumb(img) } }); ok++;
        } catch (_) {}
      }
      st.textContent = `${ok} miniatura(s) gerada(s).`;
    } catch (err) { toast(err.message, true); } finally { thumbBtn.disabled = false; }
  });

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
  // ---------- usuários ----------
  const roleLabel = (r) => (rolesInfo[r] || {}).label || r;
  function renderRoles() {
    const keys = Object.keys(rolesInfo);
    $('#role-select').innerHTML = keys.map((k) => `<option value="${k}"${k === 'vendedor' ? ' selected' : ''}>${esc(rolesInfo[k].label)}</option>`).join('');
    $('#roles-table').innerHTML = `<table class="rp-table roles"><thead><tr><th>Permissão</th>${keys.map((k) => `<th class="c">${esc(rolesInfo[k].label)}</th>`).join('')}</tr></thead><tbody>
      ${Object.entries(permsInfo).map(([pk, pl]) => `<tr><td>${esc(pl)}</td>${keys.map((k) => `<td class="c">${rolesInfo[k].perms.includes(pk) ? '<span class="yes" aria-label="sim">✓</span>' : '<span class="no" aria-label="não">—</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody></table><ul class="role-desc">${keys.map((k) => `<li><b>${esc(rolesInfo[k].label)}:</b> ${esc(rolesInfo[k].description)}</li>`).join('')}</ul>`;
  }
  async function loadUsers() {
    renderRoles();
    const list = await api('/users');
    $('#users').innerHTML = list.length ? list.map((u) => `<div class="vrow user-row${u.active ? '' : ' is-vendido'}" data-id="${u.id}">
      <div class="avatar">${esc(u.name.slice(0, 1).toUpperCase())}</div>
      <div><div class="t">${esc(u.name)} <span class="tag role-${esc(u.role)}">${esc(roleLabel(u.role))}</span>${u.active ? '' : ' <span class="tag">desativado</span>'}</div>
        <div class="s">usuário: <b>${esc(u.username)}</b> · último acesso: ${u.last_login ? new Date(u.last_login.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : 'nunca'}</div></div>
      <div class="a"><button class="btn sm" data-a="pw">Nova senha</button>
        <select class="role-pick" aria-label="Perfil de ${esc(u.name)}">${Object.keys(rolesInfo).map((k) => `<option value="${k}"${u.role === k ? ' selected' : ''}>${esc(rolesInfo[k].label)}</option>`).join('')}</select>
        <button class="btn sm ${u.active ? 'danger' : ''}" data-a="active">${u.active ? 'Desativar' : 'Reativar'}</button></div>
    </div>`).join('') : '<p class="hint">Nenhum usuário criado ainda. Por enquanto só o acesso principal existe.</p>';
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
      if (b.dataset.a === 'pw') { const pw = await askPassword(u.name); if (!pw) return; await api('/users/' + id, { method: 'PUT', body: { password: pw } }); toast('Senha de ' + u.name + ' alterada para: ' + pw); }
      if (b.dataset.a === 'active') await api('/users/' + id, { method: 'PUT', body: { active: !u.active } });
      loadUsers();
    } catch (err) { toast(err.message, true); }
  });

  $('#users').addEventListener('change', async (e) => {
    if (!e.target.matches('.role-pick')) return;
    const id = +e.target.closest('.vrow').dataset.id;
    try { await api('/users/' + id, { method: 'PUT', body: { role: e.target.value } }); toast('Perfil alterado para ' + roleLabel(e.target.value)); loadUsers(); }
    catch (err) { toast(err.message, true); loadUsers(); }
  });

  // ---------- desempenho dos anúncios ----------
  let dpDays = 30, dpData = null, dpSort = { k: 'views', dir: -1 }, dpQuery = '', dpStatus = 'ativos';
  const pct = (a, b) => (b ? (a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—');
  const carName = (v) => `${v.brand} ${v.model} ${v.year_model || ''}`.trim();
  const COLS = [
    ['views', 'Visitas', 'Vezes que o anúncio foi aberto'],
    ['people', 'Pessoas', 'Pessoas diferentes que abriram o anúncio (por dia)'],
    ['shares', 'Compart.', 'Vezes que alguém compartilhou o anúncio'],
    ['whatsapp', 'WhatsApp', 'Cliques no WhatsApp a partir do anúncio'],
    ['calls', 'Ligações', 'Cliques em "Ligar para a loja"'],
    ['forms', 'Formulários', 'Pedidos de troca ou contato feitos neste anúncio'],
    ['contacts', 'Contatos', 'WhatsApp + ligações + formulários'],
    ['conv', 'Conversão', 'Contatos ÷ pessoas que viram']
  ];

  async function loadPerf() {
    try { dpData = await api('/vehicle-stats?dias=' + dpDays); dpData.vehicles.forEach((v) => { v.conv = v.people ? v.contacts / v.people : 0; }); renderPerf(); }
    catch (err) { $('#dp').innerHTML = '<p class="hint">' + esc(err.message) + '</p>'; }
  }
  $('#dp-period').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    dpDays = +b.dataset.d; $$('#dp-period button').forEach((x) => x.classList.toggle('on', x === b)); loadPerf();
  });

  function insights(d) {
    const act = d.vehicles.filter((v) => v.status !== 'vendido');
    const out = [];
    const top = (k) => act.filter((v) => v[k] > 0).sort((a, b) => b[k] - a[k])[0];
    const tv = top('views'), ts = top('shares'), tc = top('contacts');
    if (tv) out.push(['ok', `<b>Mais visto:</b> ${esc(carName(tv))}, com ${num(tv.views)} visitas.`]);
    if (tc) out.push(['ok', `<b>Mais procurado:</b> ${esc(carName(tc))}, com ${num(tc.contacts)} contatos.`]);
    if (ts) out.push(['ok', `<b>Mais compartilhado:</b> ${esc(carName(ts))}, ${num(ts.shares)} vez(es).`]);
    const avgConv = d.totals.people ? d.totals.contacts / d.totals.people : 0;
    const views = act.map((v) => v.views).sort((a, b) => a - b); const median = views.length ? views[Math.floor(views.length / 2)] : 0;
    const cold = act.filter((v) => v.people >= Math.max(10, median * 1.5) && v.conv < avgConv * 0.5).sort((a, b) => b.people - a.people).slice(0, 3);
    if (cold.length) out.push(['warn', `<b>Muita visita, pouco contato:</b> ${cold.map((v) => esc(carName(v))).join(', ')}. Vale revisar preço, fotos ou descrição.`]);
    const none = act.filter((v) => v.views === 0 && v.daysListed >= 7);
    if (none.length) out.push(['warn', `<b>${none.length} anúncio(s) sem nenhuma visita</b> no período: ${none.slice(0, 3).map((v) => esc(carName(v))).join(', ')}${none.length > 3 ? '…' : ''}. Tente destacar ou divulgar.`]);
    const noPhoto = act.filter((v) => !v.photo);
    if (noPhoto.length) out.push(['warn', `<b>${noPhoto.length} anúncio(s) sem foto.</b> Carros com fotos recebem muito mais visitas.`]);
    return out;
  }

  function renderPerf() {
    const d = dpData, t = d.totals, s = d.site;
    const kpis = [
      ['Visitantes no site', s.visitors, `${num(s.pageviews)} páginas vistas`],
      ['Visitas aos anúncios', t.views, `${num(t.people)} pessoas diferentes`],
      ['Contatos gerados', t.contacts, `${num(t.whatsapp)} WhatsApp · ${num(t.calls)} ligações · ${num(t.forms)} formulários`],
      ['Compartilhamentos', t.shares, d.shareChannels.length ? d.shareChannels.map((c) => `${num(c.n)} ${esc(({ whatsapp: 'WhatsApp', facebook: 'Facebook', copiar: 'link', nativo: 'celular' })[c.key] || c.key)}`).join(' · ') : 'ninguém compartilhou ainda'],
      ['Conversão', null, 'pessoas que viram um anúncio e entraram em contato', pct(t.contacts, t.people)]
    ];
    const ins = insights(d);
    $('#dp').innerHTML = `
      <div class="rp-kpis dp-kpis">${kpis.map(([l, v, h, txt]) => `<div class="rp-kpi"><span class="rp-kl">${l}</span><b>${txt || num(v)}</b><small>${h}</small></div>`).join('')}</div>
      <p class="rp-note">Período: ${SSReport.dayLabel(d.from, true)} a ${SSReport.dayLabel(d.to, true)}. Desde o início, o site teve <b>${num(s.allTimePageviews)}</b> páginas vistas.</p>
      ${ins.length ? `<ul class="dp-insights">${ins.map(([l, h]) => `<li class="${l}">${h}</li>`).join('')}</ul>` : ''}
      <div class="toolbar dp-tools">
        <input type="search" id="dp-q" placeholder="Buscar carro…" value="${esc(dpQuery)}">
        <select id="dp-status"><option value="ativos">No site (disponíveis e reservados)</option><option value="todos">Todos, inclusive vendidos</option><option value="vendido">Só vendidos</option></select>
        <button class="btn" id="dp-csv" type="button">⬇ Baixar planilha (CSV)</button>
      </div>
      <div class="rp-tablewrap dp-wrap"><table class="rp-table dp-table" id="dp-table"></table></div>`;
    $('#dp-status').value = dpStatus;
    $('#dp-q').addEventListener('input', (e) => { dpQuery = e.target.value; renderPerfTable(); });
    $('#dp-status').addEventListener('change', (e) => { dpStatus = e.target.value; renderPerfTable(); });
    $('#dp-csv').addEventListener('click', downloadCsv);
    renderPerfTable();
  }

  function perfRows() {
    const q = dpQuery.toLowerCase().trim();
    return dpData.vehicles
      .filter((v) => dpStatus === 'todos' || (dpStatus === 'vendido' ? v.status === 'vendido' : v.status !== 'vendido'))
      .filter((v) => !q || `${v.id} ${v.brand} ${v.model} ${v.version} ${v.year_model}`.toLowerCase().includes(q))
      .sort((a, b) => (dpSort.k === 'name' ? carName(a).localeCompare(carName(b)) : (a[dpSort.k] - b[dpSort.k])) * dpSort.dir || b.views - a.views);
  }

  function renderPerfTable() {
    const rows = perfRows();
    const sum = (k) => rows.reduce((a, v) => a + v[k], 0);
    const arrow = (k) => (dpSort.k === k ? (dpSort.dir < 0 ? ' ▼' : ' ▲') : '');
    const maxViews = Math.max(1, ...rows.map((v) => v.views));
    $('#dp-table').innerHTML = `<thead><tr><th><button class="sort" data-k="name">Veículo${arrow('name')}</button></th><th class="r"><button class="sort" data-k="price">Preço${arrow('price')}</button></th>
      ${COLS.map(([k, l, h]) => `<th class="r"><button class="sort" data-k="${k}" title="${esc(h)}">${l}${arrow(k)}</button></th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.map((v) => `<tr data-id="${v.id}" class="dp-row" tabindex="0">
        <td class="dp-car"><img src="${v.photo ? '/thumb/' + v.photo : '/placeholder/' + v.id + '.svg'}" alt="" loading="lazy"><span><b>${esc(carName(v))}</b><small>#${v.id} · ${v.status === 'vendido' ? 'vendido' : v.status === 'reservado' ? 'reservado' : `no site há ${v.daysListed} dia(s)`}${v.demo ? ' · exemplo' : ''}</small></span></td>
        <td class="r">${v.price ? brl(v.price) : '—'}</td>
        <td class="r"><span class="dp-bar"><i style="width:${(v.views / maxViews * 100).toFixed(0)}%"></i></span>${num(v.views)}</td>
        <td class="r">${num(v.people)}</td><td class="r">${num(v.shares)}</td><td class="r">${num(v.whatsapp)}</td><td class="r">${num(v.calls)}</td><td class="r">${num(v.forms)}</td>
        <td class="r"><b>${num(v.contacts)}</b></td><td class="r">${pct(v.contacts, v.people)}</td></tr>`).join('') : `<tr><td colspan="${COLS.length + 2}" class="rp-empty">Nenhum anúncio encontrado.</td></tr>`}</tbody>
      ${rows.length > 1 ? `<tfoot><tr><td>Total (${rows.length} anúncios)</td><td></td>${['views', 'people', 'shares', 'whatsapp', 'calls', 'forms', 'contacts'].map((k) => `<td class="r">${num(sum(k))}</td>`).join('')}<td class="r">${pct(sum('contacts'), sum('people'))}</td></tr></tfoot>` : ''}`;
  }
  $('#dp').addEventListener('click', (e) => {
    const sb = e.target.closest('button.sort');
    if (sb) { const k = sb.dataset.k; dpSort = { k, dir: dpSort.k === k ? -dpSort.dir : (k === 'name' ? 1 : -1) }; renderPerfTable(); return; }
    const row = e.target.closest('.dp-row'); if (row) openVehicleStats(+row.dataset.id);
  });
  $('#dp').addEventListener('keydown', (e) => { const row = e.target.closest('.dp-row'); if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openVehicleStats(+row.dataset.id); } });

  function downloadCsv() {
    const rows = perfRows();
    const cell = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const head = ['Anúncio', 'Marca', 'Modelo', 'Versão', 'Ano', 'Preço', 'Situação', 'Dias no site', ...COLS.map((c) => c[1]), 'Visitas (desde o cadastro)'];
    const lines = rows.map((v) => [v.id, v.brand, v.model, v.version, v.year_model, v.price, v.status, v.daysListed, v.views, v.people, v.shares, v.whatsapp, v.calls, v.forms, v.contacts, v.people ? (v.contacts / v.people * 100).toFixed(1).replace('.', ',') + '%' : '', v.allTime.views]);
    const csv = '\ufeff' + [head, ...lines].map((r) => r.map(cell).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `desempenho-anuncios-${dpData.from}-a-${dpData.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // detalhe de um anúncio
  const vsDlg = $('#vstats');
  $$('[data-close]', vsDlg).forEach((b) => b.addEventListener('click', () => vsDlg.close()));
  vsDlg.addEventListener('click', (e) => { if (e.target === vsDlg) vsDlg.close(); });
  async function openVehicleStats(id) {
    if (!can('desempenho')) return;
    $('#vs-body').innerHTML = '<p class="hint">Carregando…</p>'; vsDlg.showModal();
    try {
      if (!dpData || dpData.days !== dpDays) { dpData = await api('/vehicle-stats?dias=' + dpDays); dpData.vehicles.forEach((v) => { v.conv = v.people ? v.contacts / v.people : 0; }); }
      const v = dpData.vehicles.find((x) => x.id === id) || (vehicles.find((x) => x.id === id) && { ...vehicles.find((x) => x.id === id), people: 0, shares: 0, whatsapp: 0, calls: 0, forms: 0, contacts: 0, daysListed: 0, allTime: { views: 0, whatsapp: 0, shares: 0, calls: 0 } });
      const d = await api(`/vehicle-stats/${id}?dias=${dpDays}`);
      $('#vs-title').textContent = v ? `${carName(v)} · #${id}` : `Anúncio #${id}`;
      const act = dpData.vehicles.filter((x) => x.status !== 'vendido');
      const rank = v ? act.slice().sort((a, b) => b.views - a.views).findIndex((x) => x.id === id) + 1 : 0;
      const avgViews = act.length ? act.reduce((a, x) => a + x.views, 0) / act.length : 0;
      const vsAvg = v && avgViews ? Math.round((v.views / avgViews - 1) * 100) : null;
      const k = (l, val, h) => `<div class="rp-kpi"><span class="rp-kl">${l}</span><b>${val}</b><small>${h}</small></div>`;
      const P = (x) => `${dpDays === 365 ? '12 meses' : dpDays + ' dias'}`;
      $('#vs-body').innerHTML = !v ? '<p class="hint">Anúncio não encontrado.</p>' : `
        <p class="hint">${v.version ? esc(v.version) + ' · ' : ''}${v.price ? brl(v.price) : ''} · ${v.status === 'vendido' ? 'vendido' : `no site há ${v.daysListed} dia(s)`} · <a href="/veiculo/${id}" target="_blank">ver anúncio ↗</a></p>
        <div class="rp-kpis dp-kpis">
          ${k('Visitas', num(v.views), `${num(v.people)} pessoas · ${num(v.allTime.views)} desde o cadastro`)}
          ${k('Contatos', num(v.contacts), `${num(v.whatsapp)} WhatsApp · ${num(v.calls)} ligações · ${num(v.forms)} formulários`)}
          ${k('Compartilhamentos', num(v.shares), `${num(v.allTime.shares)} desde o cadastro`)}
          ${k('Conversão', pct(v.contacts, v.people), 'das pessoas que viram entraram em contato')}
          ${k('Posição', rank ? rank + 'º' : '—', `entre ${act.length} anúncios em visitas${vsAvg != null && v.status !== 'vendido' ? ` · ${vsAvg >= 0 ? vsAvg + '% acima' : Math.abs(vsAvg) + '% abaixo'} da média` : ''}`)}
        </div>
        <p class="rp-note">Últimos ${P()}.</p>
        <div class="rp-charts">
          ${SSReport.bars(d.series, 'views', 'Visitas por dia')}
          ${SSReport.bars(d.series, 'contacts', 'Contatos por dia')}
        </div>
        <div class="rp-grid2">
          ${SSReport.hbars(d.sources, 'De onde vieram as pessoas', 'Ainda sem visitas neste período.')}
          ${SSReport.hbars(d.shareChannels, 'Como compartilharam', 'Ninguém compartilhou este anúncio ainda.')}
        </div>`;
      SSReport.bindTips($('#vs-body'), d.series, [['Visitas', 'views'], ['Pessoas', 'people'], ['Contatos', 'contacts'], ['Compartilhamentos', 'shares']]);
    } catch (err) { $('#vs-body').innerHTML = '<p class="hint">' + esc(err.message) + '</p>'; }
  }

  start();
})();
