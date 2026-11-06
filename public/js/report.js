/* Relatório de estatísticas do site — usado no painel da loja e no painel de suporte. */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const dayLabel = (d, long) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', long ? { weekday: 'short', day: '2-digit', month: 'short' } : { day: '2-digit', month: '2-digit' });

  function delta(cur, prev) {
    if (!prev && !cur) return '<span class="rp-delta">sem dados no período anterior</span>';
    if (!prev) return '<span class="rp-delta">sem período anterior para comparar</span>';
    const p = Math.round((cur - prev) / prev * 100);
    const cls = p > 0 ? 'up' : p < 0 ? 'down' : '';
    return `<span class="rp-delta ${cls}">${p > 0 ? '▲' : p < 0 ? '▼' : '='} ${Math.abs(p)}% vs período anterior</span>`;
  }

  // Gráfico de barras de uma série (sem eixo duplo), com dica ao passar o dedo/mouse.
  function bars(series, key, title, unit) {
    const W = 720, H = 200, padL = 34, padB = 26, padT = 10;
    const max = Math.max(1, ...series.map((d) => d[key]));
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const n = series.length, bw = (W - padL) / n, gap = Math.min(2, bw * 0.2);
    const y = (v) => padT + (H - padT - padB) * (1 - v / top);
    const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
    const every = Math.ceil(n / 8);
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="rp-svg" role="img" aria-label="${esc(title)}">
      ${ticks.map((v) => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="rp-grid"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" class="rp-tick">${num(v)}</text>`).join('')}
      ${series.map((d, i) => {
        const x = padL + i * bw + gap / 2, h = Math.max(0, H - padB - y(d[key])), w = Math.max(1, bw - gap);
        const r = Math.min(4, w / 2, h);
        const yy = H - padB - h;
        const path = h > 0 ? `M${x},${H - padB} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${H - padB} Z` : '';
        return `<g class="rp-bar" data-i="${i}"><rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"/>${path ? `<path d="${path}"/>` : ''}</g>`;
      }).join('')}
      ${series.map((d, i) => (i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every * 0.6) ? `<text x="${padL + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" class="rp-tick">${dayLabel(d.day)}</text>` : '').join('')}
      <line x1="${padL}" x2="${W}" y1="${H - padB}" y2="${H - padB}" class="rp-axis"/>
    </svg>`;
    return `<figure class="rp-chart" data-key="${key}"><figcaption>${esc(title)}</figcaption><div class="rp-plot">${svg}<div class="rp-tip" hidden></div></div></figure>`;
  }
  function niceStep(max) {
    const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p);
  }

  function hbars(rows, title, empty) {
    const total = rows.reduce((a, r) => a + r.n, 0);
    if (!total) return `<div class="rp-card"><h3>${esc(title)}</h3><p class="rp-empty">${esc(empty || 'Ainda sem dados.')}</p></div>`;
    const max = Math.max(...rows.map((r) => r.n));
    return `<div class="rp-card"><h3>${esc(title)}</h3><ul class="rp-hbars">${rows.slice(0, 8).map((r) => `<li><span class="rp-hl">${esc(r.key || '—')}</span><span class="rp-track"><span style="width:${(r.n / max * 100).toFixed(1)}%"></span></span><span class="rp-hv">${num(r.n)} <small>${Math.round(r.n / total * 100)}%</small></span></li>`).join('')}</ul></div>`;
  }

  function render(el, d, opts = {}) {
    const t = d.totals, pv = d.previous;
    const conv = t.visitors ? (t.whatsapp / t.visitors * 100) : 0;
    const kpis = [
      ['Visitantes', t.visitors, pv.visitors, 'pessoas diferentes que abriram o site'],
      ['Carros vistos', t.vehicleViews, pv.vehicleViews, 'aberturas de anúncios'],
      ['Cliques no WhatsApp', t.whatsapp, pv.whatsapp, 'clientes que chamaram a loja'],
      ['Formulários', t.leads, pv.leads, 'avaliações de troca e pedidos de aviso']
    ];
    el.innerHTML = `
      <div class="rp-kpis">${kpis.map(([l, v, p, h]) => `<div class="rp-kpi"><span class="rp-kl">${l}</span><b>${num(v)}</b>${delta(v, p)}<small>${h}</small></div>`).join('')}</div>
      <p class="rp-note">${t.visitors ? `<b>${conv.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b> dos visitantes chamaram no WhatsApp neste período.` : 'Os números aparecem conforme as pessoas visitam o site.'} Período: ${dayLabel(d.from, true)} a ${dayLabel(d.to, true)}.</p>
      <div class="rp-charts">
        ${bars(d.series, 'visitors', 'Visitantes por dia')}
        ${bars(d.series, 'whatsapp', 'Cliques no WhatsApp por dia')}
      </div>
      <div class="rp-grid2">
        ${hbars(d.sources, 'De onde vêm os visitantes')}
        ${hbars(d.devices, 'Aparelho usado')}
        ${hbars(d.pages, 'Páginas mais vistas')}
        ${hbars(d.searches, 'O que mais buscam', 'Nenhuma busca por marca ou modelo ainda.')}
      </div>
      <div class="rp-card"><h3>Carros mais procurados</h3>
        ${d.top.length ? `<div class="rp-tablewrap"><table class="rp-table"><thead><tr><th>Veículo</th><th>Preço</th><th class="r">Visualizações</th><th class="r">WhatsApp</th><th class="r">Conversão</th></tr></thead><tbody>
        ${d.top.map((v) => `<tr><td>${opts.linkVehicles ? `<a href="/veiculo/${v.id}" target="_blank">` : ''}${esc(v.brand)} ${esc(v.model)} ${v.year_model}${opts.linkVehicles ? '</a>' : ''} <small>#${v.id}${v.status === 'vendido' ? ' · vendido' : ''}</small></td><td>${brl(v.price)}</td><td class="r">${num(v.views)}</td><td class="r">${num(v.whatsapp)}</td><td class="r">${v.views ? Math.round(v.whatsapp / v.views * 100) + '%' : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="rp-empty">Ainda sem visualizações de anúncios.</p>'}
      </div>
      <details class="rp-card rp-data"><summary>Ver números dia a dia (tabela)</summary><div class="rp-tablewrap"><table class="rp-table"><thead><tr><th>Dia</th><th class="r">Visitantes</th><th class="r">Páginas vistas</th><th class="r">WhatsApp</th><th class="r">Formulários</th></tr></thead><tbody>
        ${d.series.slice().reverse().map((s) => `<tr><td>${dayLabel(s.day, true)}</td><td class="r">${num(s.visitors)}</td><td class="r">${num(s.pageviews)}</td><td class="r">${num(s.whatsapp)}</td><td class="r">${num(s.leads)}</td></tr>`).join('')}
      </tbody></table></div></details>`;

    // dicas ao passar o mouse/dedo
    el.querySelectorAll('.rp-chart').forEach((fig) => {
      const tip = fig.querySelector('.rp-tip'), plot = fig.querySelector('.rp-plot');
      const show = (g) => {
        fig.querySelectorAll('.rp-bar.on').forEach((x) => x.classList.remove('on'));
        g.classList.add('on');
        const s = d.series[+g.dataset.i];
        tip.innerHTML = `<b>${dayLabel(s.day, true)}</b><span>Visitantes <b>${num(s.visitors)}</b></span><span>WhatsApp <b>${num(s.whatsapp)}</b></span><span>Formulários <b>${num(s.leads)}</b></span>`;
        tip.hidden = false;
        const pr = plot.getBoundingClientRect(), br = g.getBoundingClientRect();
        let left = br.left - pr.left + br.width / 2 - tip.offsetWidth / 2;
        left = Math.max(0, Math.min(pr.width - tip.offsetWidth, left));
        tip.style.left = left + 'px';
      };
      fig.querySelectorAll('.rp-bar').forEach((g) => { g.addEventListener('mouseenter', () => show(g)); g.addEventListener('click', () => show(g)); });
      plot.addEventListener('mouseleave', () => { tip.hidden = true; fig.querySelectorAll('.rp-bar.on').forEach((x) => x.classList.remove('on')); });
    });
  }

  window.SSReport = { render };
})();
