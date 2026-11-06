'use strict';
const { openNow } = require('./db');
const BRAND = require('./brand');
const { esc, brl, num, onlyDigits, vehicleUrl, vehicleTitle, photoUrl, waLink, waVehicleText, icons, layout, card, badge } = require('./views');

const PRICE_STEPS = [50000, 70000, 90000, 120000, 150000, 200000, 300000];

function home(ctx, { featured, latest, brands, bodies, total }) {
  const byId = ctx.unitsById;
  const body = `
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-copy">
      <p class="eyebrow">${esc(BRAND.slogan)}</p>
      <h1>${BRAND.heroTitle}</h1>
      <p class="lead">${total} veículos com procedência, financiamento em até 60x e avaliação justa do seu usado na troca.</p>
    </div>
    <form class="search-box" action="/estoque" method="get" role="search">
      <h2>Encontre seu carro</h2>
      <label>Marca
        <select name="marca"><option value="">Todas as marcas</option>${brands.map((b) => `<option>${esc(b)}</option>`).join('')}</select>
      </label>
      <label>Modelo ou versão
        <input name="q" type="search" placeholder="Ex.: Corolla, Compass, HB20" autocomplete="off">
      </label>
      <label>Preço até
        <select name="preco_max"><option value="">Qualquer valor</option>${PRICE_STEPS.map((p) => `<option value="${p}">${brl(p)}</option>`).join('')}</select>
      </label>
      <button class="btn btn-red" type="submit">${icons.search} Buscar veículos</button>
    </form>
  </div>
  <div class="wrap quick">
    ${bodies.map((b) => `<a href="/estoque?carroceria=${encodeURIComponent(b)}">${esc(b)}</a>`).join('')}
    <a href="/estoque?condicao=0km" class="quick-new">0 km</a>
    <a href="/estoque?preco_max=80000">Até R$ 80 mil</a>
  </div>
</section>

${featured.length ? `<section class="section">
  <div class="wrap">
    <div class="section-head"><h2>Destaques da semana</h2><a href="/estoque">Ver todo o estoque →</a></div>
    <div class="grid">${featured.map((v) => card(v, byId)).join('')}</div>
  </div>
</section>` : ''}

<section class="section section-alt">
  <div class="wrap">
    <h2 class="center">Por que comprar na ${esc(BRAND.name)}</h2>
    <div class="why">
      <div>${icons.shield}<h3>Procedência garantida</h3><p>Todos os seminovos passam por vistoria e laudo cautelar antes de entrar no estoque.</p></div>
      <div>${icons.money}<h3>Financiamento facilitado</h3><p>Trabalhamos com os principais bancos para conseguir a melhor taxa e parcelas em até 60x.</p></div>
      <div>${icons.swap}<h3>Seu usado na troca</h3><p>Avaliação justa e rápida do seu carro como parte do pagamento.</p></div>
      <div>${icons.store}<h3>${ctx.units.length > 1 ? `${ctx.units.length} lojas` : 'Atendimento de verdade'}</h3><p>${ctx.units.length > 1 ? `Atendimento em ${ctx.units.length} unidades para ficar mais perto de você.` : 'Venha conhecer a loja, fazer um test drive e negociar com quem entende.'}</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><h2>Chegaram agora</h2><a href="/estoque?ordem=recentes">Ver mais →</a></div>
    <div class="grid">${latest.map((v) => card(v, byId)).join('')}</div>
  </div>
</section>

<section class="cta-band">
  <div class="wrap cta-in">
    <div><h2>Quer vender ou trocar seu carro?</h2><p>Mande os dados e a gente avalia sem compromisso.</p></div>
    <a href="/venda-seu-carro" class="btn btn-white">Avaliar meu carro</a>
  </div>
</section>

${unitsSection(ctx)}`;
  return layout({ title: '', body, ctx, canonical: '/', active: 'home' });
}

function unitsSection(ctx, withMap = false) {
  return `<section class="section">
  <div class="wrap">
    <h2 class="center">Nossas lojas</h2>
    <div class="units">
      ${ctx.units.map((u) => {
        const q = encodeURIComponent([u.address, u.neighborhood, u.city].filter(Boolean).join(', '));
        return `<div class="unit">
        ${withMap ? `<iframe class="unit-map" title="Mapa da ${esc(u.name)}" loading="lazy" src="https://www.google.com/maps?q=${q}&output=embed"></iframe>` : ''}
        <div class="unit-body">
          <h3>${esc(u.name)}${(() => { const o = openNow(u.hours_json); return o == null ? '' : `<span class="open-pill ${o ? 'on' : ''}">${o ? 'Aberto agora' : 'Fechado agora'}</span>`; })()}</h3>
          <p>${icons.pin}<span>${esc(u.address)}${u.neighborhood ? ` · ${esc(u.neighborhood)}` : ''}<br>${esc(u.city)}</span></p>
          ${u.hours ? `<p>${icons.clock}<span>${esc(u.hours)}</span></p>` : ''}
          <div class="unit-actions">
            ${onlyDigits(u.whatsapp).length >= 10 ? `<a class="btn btn-wa" href="${waLink(u.whatsapp, `Olá! Vim pelo site e gostaria de falar com a ${u.name}.`)}" target="_blank" rel="noopener">${icons.wa} WhatsApp</a>` : ''}
            ${u.phone ? `<a class="btn btn-ghost" href="tel:${onlyDigits(u.phone)}">${icons.phone} Ligar</a>` : ''}
            <a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${icons.pin} Como chegar</a>
          </div>
        </div>
      </div>`;
      }).join('')}
    </div>
  </div>
</section>`;
}

const consentLine = '<p class="fine">Ao enviar, você concorda com a nossa <a href="/privacidade">Política de privacidade</a>.</p>';

function alertForm(f = {}) {
  const wish = [f.marca, f.q, f.carroceria].filter(Boolean).join(' ');
  return `<section class="alert-box">
    <div><h2>Não achou o carro que procura?</h2><p>Diga qual é e a gente avisa no seu WhatsApp quando chegar.</p></div>
    <form class="alert-form js-lead" data-type="alerta" data-ok="Pronto! Vamos te avisar assim que chegar um carro assim.">
      <label>Carro desejado<input name="wish" required placeholder="Ex.: Corolla, SUV automático" value="${esc(wish)}"></label>
      <label>Valor até (opcional)<input name="max_price" inputmode="numeric" placeholder="Ex.: 120000" value="${esc(f.preco_max || '')}"></label>
      <label>Seu nome<input name="name" required autocomplete="name"></label>
      <label>WhatsApp<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="(83) 90000-0000"></label>
      <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
      <button class="btn btn-red" type="submit">Quero ser avisado</button>
      <p class="form-ok" hidden></p>
      ${consentLine}
    </form>
  </section>`;
}

function stock(ctx, { list, total, page, pages, f, facets }) {
  const byId = ctx.unitsById;
  const qs = (extra) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== '' && v != null) p.set(k, v);
    const s = p.toString();
    return '/estoque' + (s ? `?${s}` : '');
  };
  const sel = (name, opts, current, all) => `<select name="${name}"><option value="">${all}</option>${opts.map((o) => {
    const [val, label] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(val)}"${String(current) === String(val) ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('')}</select>`;
  const activeCount = ['marca', 'q', 'preco_min', 'preco_max', 'ano_min', 'km_max', 'cambio', 'combustivel', 'condicao', 'unidade', 'carroceria'].filter((k) => f[k]).length;
  let heading = 'Estoque completo';
  if (f.condicao === '0km') heading = 'Carros 0 km';
  else if (f.condicao === 'seminovo') heading = 'Seminovos';
  if (f.marca) heading += ` ${f.marca}`;
  if (f.carroceria) heading += ` · ${f.carroceria}`;

  const body = `
<section class="page-head">
  <div class="wrap"><h1>${esc(heading)}</h1><p>${total} ${total === 1 ? 'veículo encontrado' : 'veículos encontrados'}</p></div>
</section>
<section class="wrap stock">
  <details class="filters" ${activeCount ? '' : ''} open>
    <summary>Filtros${activeCount ? ` <span class="pill">${activeCount}</span>` : ''}</summary>
    <form action="/estoque" method="get" class="filters-form">
      <label>Busca<input type="search" name="q" value="${esc(f.q)}" placeholder="Modelo, versão…"></label>
      <label>Condição${sel('condicao', [['seminovo', 'Seminovo'], ['0km', '0 km']], f.condicao, 'Todos')}</label>
      <label>Marca${sel('marca', facets.brands, f.marca, 'Todas')}</label>
      <label>Carroceria${sel('carroceria', facets.bodies, f.carroceria, 'Todas')}</label>
      <div class="two">
        <label>Preço mín.${sel('preco_min', PRICE_STEPS.map((p) => [p, brl(p)]), f.preco_min, 'Sem mín.')}</label>
        <label>Preço máx.${sel('preco_max', PRICE_STEPS.map((p) => [p, brl(p)]), f.preco_max, 'Sem máx.')}</label>
      </div>
      <div class="two">
        <label>Ano a partir de${sel('ano_min', facets.years, f.ano_min, 'Qualquer')}</label>
        <label>Km até${sel('km_max', [[20000, '20 mil'], [40000, '40 mil'], [60000, '60 mil'], [80000, '80 mil'], [100000, '100 mil']], f.km_max, 'Qualquer')}</label>
      </div>
      <label>Câmbio${sel('cambio', facets.transmissions, f.cambio, 'Todos')}</label>
      <label>Combustível${sel('combustivel', facets.fuels, f.combustivel, 'Todos')}</label>
      <label>Loja${sel('unidade', ctx.units.map((u) => [u.id, u.name]), f.unidade, 'Todas as lojas')}</label>
      <input type="hidden" name="ordem" value="${esc(f.ordem)}">
      <button class="btn btn-blue" type="submit">Aplicar filtros</button>
      ${activeCount ? '<a class="clear" href="/estoque">Limpar filtros</a>' : ''}
    </form>
  </details>
  <div class="results">
    <div class="results-bar">
      <form action="/estoque" method="get" class="sort-form">
        ${Object.entries(f).filter(([k, v]) => k !== 'ordem' && k !== 'pagina' && v).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}
        <label>Ordenar por
          <select name="ordem" class="js-autosubmit">
            ${[['', 'Mais relevantes'], ['menor_preco', 'Menor preço'], ['maior_preco', 'Maior preço'], ['recentes', 'Mais recentes'], ['menor_km', 'Menor km'], ['ano', 'Ano mais novo']].map(([v, l]) => `<option value="${v}"${f.ordem === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <noscript><button type="submit">OK</button></noscript>
      </form>
    </div>
    ${list.length ? `<div class="grid grid-3">${list.map((v) => card(v, byId)).join('')}</div>` : `<div class="empty">
      <h2>Nenhum veículo com esses filtros</h2>
      <p>Tente ampliar a busca ou fale com a gente: se não tivermos, a gente procura para você.</p>
      <a class="btn btn-blue" href="/estoque">Ver todo o estoque</a>
      <button class="btn btn-wa js-wa-open" type="button">${icons.wa} Pedir pelo WhatsApp</button>
    </div>`}
    ${alertForm(f)}
    ${pages > 1 ? `<nav class="pager" aria-label="Páginas">${Array.from({ length: pages }, (_, i) => i + 1).map((p) => p === page ? `<span aria-current="page">${p}</span>` : `<a href="${qs({ pagina: p })}">${p}</a>`).join('')}</nav>` : ''}
  </div>
</section>`;
  return layout({ title: heading, body, ctx, canonical: '/estoque', active: f.condicao === '0km' ? '0km' : f.condicao === 'seminovo' ? 'seminovo' : 'estoque' });
}

function vehicle(ctx, v, similar) {
  const unit = ctx.unitsById[v.unit_id] || ctx.units[0];
  const photos = v.photos.length ? v.photos.map((_, i) => photoUrl(v, i)) : [photoUrl(v)];
  const title = `${vehicleTitle(v)} ${v.version} ${v.year_fab}/${v.year_model}`;
  const wa = unit && onlyDigits(unit.whatsapp).length >= 10 ? waLink(unit.whatsapp, waVehicleText(v)) : '';
  const rate = parseFloat(String(ctx.settings.finance_rate).replace(',', '.')) || 1.89;
  const specs = [
    ['Ano', `${v.year_fab}/${v.year_model}`], ['Quilometragem', v.condition === '0km' ? '0 km' : `${num(v.km)} km`],
    ['Câmbio', v.transmission], ['Combustível', v.fuel], ['Carroceria', v.body], ['Cor', v.color],
    ['Portas', v.doors], ['Final da placa', v.plate_end], ['Condição', v.condition === '0km' ? '0 km' : 'Seminovo']
  ].filter(([, val]) => val !== '' && val != null && val !== 0);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Car', name: title, brand: { '@type': 'Brand', name: v.brand }, model: v.model,
    vehicleModelDate: String(v.year_model), mileageFromOdometer: { '@type': 'QuantitativeValue', value: v.km, unitCode: 'KMT' },
    fuelType: v.fuel, vehicleTransmission: v.transmission, color: v.color, itemCondition: v.condition === '0km' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    offers: { '@type': 'Offer', price: v.price, priceCurrency: 'BRL', availability: v.status === 'vendido' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' }
  };
  const body = `
<div class="wrap crumbs"><a href="/">Início</a> › <a href="/estoque">Estoque</a> › <a href="/estoque?marca=${encodeURIComponent(v.brand)}">${esc(v.brand)}</a> › <span>${esc(v.model)}</span></div>
<section class="wrap vehicle">
  <div class="gallery">
    <div class="gallery-main" tabindex="0" aria-label="Fotos do veículo">
      ${photos.map((src, i) => `<img src="${src}" alt="${esc(title)}, foto ${i + 1}" ${i ? 'loading="lazy"' : ''} width="1200" height="820">`).join('')}
    </div>
    ${badge(v)}
    <button class="gzoom js-zoom" type="button" aria-label="Ver fotos em tela cheia"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg><span>Tela cheia</span></button>
    ${photos.length > 1 ? `<span class="gallery-count"><span class="js-gcur">1</span>/${photos.length}</span>
    <button class="gnav gprev" type="button" aria-label="Foto anterior">‹</button><button class="gnav gnext" type="button" aria-label="Próxima foto">›</button>
    <div class="thumbs">${photos.map((src, i) => `<button type="button" data-i="${i}"${i === 0 ? ' class="on"' : ''}><img src="${src}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    ${v.is_demo && v.photos.length ? '<span class="photo-credit">Fotos de exemplo · Wikimedia Commons</span>' : ''}
  </div>

  <aside class="buybox">
    <h1>${esc(vehicleTitle(v))} <span>${esc(v.version)}</span></h1>
    <ul class="chips"><li>${v.year_fab}/${v.year_model}</li><li>${v.condition === '0km' ? '0 km' : `${num(v.km)} km`}</li><li>${esc(v.transmission)}</li><li>${esc(v.fuel)}</li></ul>
    <div class="price">
      ${v.price_old > v.price ? `<s>${brl(v.price_old)}</s>` : ''}
      <strong>${v.price ? brl(v.price) : 'Consulte'}</strong>
    </div>
    ${v.status === 'vendido' ? `<div class="sold-note">Este veículo já foi vendido. Veja opções parecidas abaixo ou fale com a gente.</div>` : ''}
    ${v.status === 'reservado' ? `<div class="sold-note res">Veículo reservado. Fale com a gente para entrar na fila de espera.</div>` : ''}
    ${wa ? `<a class="btn btn-wa btn-lg js-track" data-id="${v.id}" href="${wa}" target="_blank" rel="noopener">${icons.wa} Tenho interesse</a>` : ''}
    ${unit && unit.phone ? `<a class="btn btn-ghost btn-lg" href="tel:${onlyDigits(unit.phone)}">${icons.phone} Ligar para a loja</a>` : ''}
    <a class="btn btn-ghost btn-lg" href="/venda-seu-carro?veiculo=${v.id}">${icons.swap} Quero dar meu carro na troca</a>
    <div class="two-btn">
      <button type="button" class="btn btn-ghost js-fav" data-id="${v.id}" aria-pressed="false">${icons.heart}<span>Favoritar</span></button>
      <button type="button" class="btn btn-ghost js-cmp" data-id="${v.id}" aria-pressed="false">${icons.compare}<span>Comparar</span></button>
    </div>
    ${unit ? `<div class="where">${icons.pin}<div><strong>Disponível na ${esc(unit.name)}</strong><span>${esc(unit.address)}${unit.neighborhood ? ` · ${esc(unit.neighborhood)}` : ''}, ${esc(unit.city)}</span></div></div>` : ''}

    <div class="sim" data-price="${v.price}" data-rate="${rate}">
      <h2>Simule seu financiamento</h2>
      <label>Entrada <output class="js-entry-out"></output>
        <input type="range" class="js-entry" min="0" max="${v.price}" step="1000" value="${Math.round(v.price * 0.3 / 1000) * 1000}">
      </label>
      <div class="terms" role="radiogroup" aria-label="Prazo">
        ${[24, 36, 48, 60].map((n) => `<label><input type="radio" name="prazo" value="${n}"${n === 48 ? ' checked' : ''}><span>${n}x</span></label>`).join('')}
      </div>
      <p class="sim-result">Parcelas a partir de <strong class="js-parcela">—</strong></p>
      <p class="fine">Simulação com taxa de referência de ${String(rate).replace('.', ',')}% a.m. Valores sujeitos a análise de crédito.</p>
      ${wa ? `<a class="btn btn-blue js-sim-wa js-track" data-id="${v.id}" data-wa="${onlyDigits(unit.whatsapp)}" data-car="${esc(`${vehicleTitle(v)} ${v.version} ${v.year_model} (anúncio #${v.id})`)}" href="${wa}" target="_blank" rel="noopener">Enviar simulação pelo WhatsApp</a>` : ''}
    </div>
  </aside>

  <div class="details">
    <h2>Ficha técnica</h2>
    <dl class="specs">${specs.map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>
    ${v.options.length ? `<h2>Itens e opcionais</h2><ul class="options">${v.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
    ${v.description ? `<h2>Sobre este veículo</h2><div class="desc">${esc(v.description).replace(/\n/g, '<br>')}</div>` : ''}
    ${v.status === 'vendido' ? alertForm({ q: `${v.brand} ${v.model}` }) : ''}
  </div>
</section>
<div class="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="Fotos em tela cheia">
  <div class="lb-top"><span class="lb-count"><span class="js-lbcur">1</span> / ${photos.length}</span><button class="lb-close" type="button" aria-label="Fechar">×</button></div>
  <div class="lb-track">${photos.map((src, i) => `<figure><img src="${src}" alt="${esc(title)}, foto ${i + 1}" loading="lazy"></figure>`).join('')}</div>
  ${photos.length > 1 ? '<button class="lb-nav lb-prev" type="button" aria-label="Foto anterior">‹</button><button class="lb-nav lb-next" type="button" aria-label="Próxima foto">›</button>' : ''}
</div>
${similar.length ? `<section class="section section-alt"><div class="wrap"><div class="section-head"><h2>Você também pode gostar</h2><a href="/estoque">Ver estoque →</a></div><div class="grid">${similar.map((s) => card(s, ctx.unitsById)).join('')}</div></div></section>` : ''}
${wa ? `<div class="mobile-cta"><div><small>${esc(vehicleTitle(v))}</small><strong>${v.price ? brl(v.price) : 'Consulte'}</strong></div><a class="btn btn-wa js-track" data-id="${v.id}" href="${wa}" target="_blank" rel="noopener">${icons.wa} Tenho interesse</a></div>` : ''}`;
  return layout({
    title, description: `${title} por ${brl(v.price)} na ${BRAND.name}. ${v.condition === '0km' ? '0 km' : num(v.km) + ' km'}, ${v.transmission}, ${v.fuel}. Financiamento e troca.`,
    body, ctx, canonical: vehicleUrl(v), ogImage: photoUrl(v), active: 'estoque',
    head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
  });
}

function sell(ctx, preVehicle) {
  const body = `
<section class="page-head"><div class="wrap"><h1>Venda ou troque seu carro</h1><p>Preencha os dados e um consultor responde com a avaliação.</p></div></section>
<section class="wrap narrow">
  ${preVehicle ? `<div class="pre">Troca no <strong>${esc(`${vehicleTitle(preVehicle)} ${preVehicle.version} ${preVehicle.year_model}`)}</strong> (anúncio #${preVehicle.id})</div>` : ''}
  <form class="form js-lead" data-type="troca">
    ${preVehicle ? `<input type="hidden" name="vehicle_id" value="${preVehicle.id}">` : ''}
    <fieldset><legend>Seus dados</legend>
      <label>Nome<input name="name" required autocomplete="name"></label>
      <label>WhatsApp<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000"></label>
    </fieldset>
    <fieldset><legend>Seu carro</legend>
      <div class="two"><label>Marca<input name="car_brand" required></label><label>Modelo e versão<input name="car_model" required></label></div>
      <div class="two"><label>Ano<input name="car_year" required inputmode="numeric" placeholder="2020/2021"></label><label>Quilometragem<input name="car_km" inputmode="numeric" placeholder="Ex.: 45000"></label></div>
      <label>Loja de preferência<select name="unit_id">${ctx.units.map((u) => `<option value="${u.id}"${preVehicle && preVehicle.unit_id === u.id ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
      <label>Observações<textarea name="message" rows="3" placeholder="Estado do carro, se está quitado, detalhes…"></textarea></label>
    </fieldset>
    <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
    <button class="btn btn-red btn-lg" type="submit">Enviar para avaliação</button>
    <p class="form-ok" hidden></p>
    ${consentLine}
  </form>
</section>`;
  return layout({ title: 'Venda seu carro', description: `Avaliação do seu carro para venda ou troca na ${BRAND.name}.`, body, ctx, canonical: '/venda-seu-carro', active: 'venda' });
}

function stores(ctx) {
  const body = `<section class="page-head"><div class="wrap"><h1>Nossas lojas</h1><p>Duas unidades para atender você.</p></div></section>${unitsSection(ctx, true)}`;
  return layout({ title: 'Nossas lojas', body, ctx, canonical: '/lojas', active: 'lojas' });
}

function favorites(ctx, list) {
  const body = `<section class="page-head"><div class="wrap"><h1>Meus favoritos</h1><p>Os carros que você salvou ficam guardados neste aparelho.</p></div></section>
<section class="wrap section js-favpage">
  ${list.length ? `<div class="grid">${list.map((v) => card(v, ctx.unitsById)).join('')}</div>` : `<div class="empty"><h2>Você ainda não salvou nenhum carro</h2><p>Toque no coração dos anúncios para guardar os que mais gostou.</p><a class="btn btn-blue" href="/estoque">Ver estoque</a></div>`}
</section>`;
  return layout({ title: 'Meus favoritos', body, ctx });
}

function compare(ctx, list) {
  const rate = parseFloat(String(ctx.settings.finance_rate).replace(',', '.')) / 100 || 0.0189;
  const pmt = (v) => { const pv = v.price * 0.7, n = 48; return rate ? pv * rate / (1 - Math.pow(1 + rate, -n)) : pv / n; };
  const allOpts = [...new Set(list.flatMap((v) => v.options))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const minPrice = Math.min(...list.map((v) => v.price || Infinity));
  const minKm = Math.min(...list.map((v) => v.km));
  const rows = [
    ['Preço', (v) => `<strong class="${v.price === minPrice && list.length > 1 ? 'best' : ''}">${v.price ? brl(v.price) : 'Consulte'}</strong>`],
    ['Parcela estimada*', (v) => v.price ? `48x ${brl(pmt(v))}` : '—'],
    ['Ano', (v) => `${v.year_fab}/${v.year_model}`],
    ['Quilometragem', (v) => `<span class="${v.km === minKm && list.length > 1 ? 'best' : ''}">${v.condition === '0km' ? '0 km' : num(v.km) + ' km'}</span>`],
    ['Câmbio', (v) => esc(v.transmission)], ['Combustível', (v) => esc(v.fuel)], ['Carroceria', (v) => esc(v.body)], ['Cor', (v) => esc(v.color)],
    ['Loja', (v) => esc((ctx.unitsById[v.unit_id] || {}).name || '—')],
    ...allOpts.map((o) => [esc(o), (v) => v.options.includes(o) ? '<span class="yes" aria-label="Sim">✓</span>' : '<span class="no" aria-label="Não">—</span>'])
  ];
  const body = `<section class="page-head"><div class="wrap"><h1>Comparar veículos</h1><p>${list.length ? 'Veja lado a lado e escolha o seu.' : 'Escolha até 3 carros no estoque tocando no ícone de comparar.'}</p></div></section>
<section class="wrap section">
  ${list.length ? `<div class="cmp-scroll"><table class="cmp">
    <thead><tr><th scope="col"><span class="sr">Item</span></th>${list.map((v) => {
      const unit = ctx.unitsById[v.unit_id];
      const wa = unit && onlyDigits(unit.whatsapp).length >= 10 ? waLink(unit.whatsapp, waVehicleText(v)) : '';
      return `<th scope="col"><a href="${vehicleUrl(v)}"><img src="${photoUrl(v)}" alt="" loading="lazy"></a>
      <a class="cmp-name" href="${vehicleUrl(v)}">${esc(vehicleTitle(v))}</a><small>${esc(v.version)}</small>
      ${wa ? `<a class="btn btn-wa js-track" data-id="${v.id}" href="${wa}" target="_blank" rel="noopener">${icons.wa} Tenho interesse</a>` : ''}
      <button type="button" class="link js-cmp-remove" data-id="${v.id}">Remover</button></th>`;
    }).join('')}</tr></thead>
    <tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${list.map((v) => `<td>${fn(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>
  <p class="fine">*Estimativa com 30% de entrada e taxa de referência de ${String(ctx.settings.finance_rate).replace('.', ',')}% a.m. Sujeito a análise de crédito.</p>
  ${list.length < 3 ? '<p><a href="/estoque">+ Adicionar outro carro à comparação</a></p>' : ''}` : `<div class="empty"><h2>Nenhum carro selecionado</h2><p>No estoque, toque no ícone <span aria-hidden="true">⇆</span> dos anúncios para comparar até 3 carros.</p><a class="btn btn-blue" href="/estoque">Ver estoque</a></div>`}
</section>`;
  return layout({ title: 'Comparar veículos', body, ctx });
}

function privacy(ctx) {
  const s = ctx.settings;
  const contact = [s.email ? `pelo e-mail <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '', ctx.units[0] && ctx.units[0].phone ? `pelo telefone ${esc(ctx.units[0].phone)}` : ''].filter(Boolean).join(' ou ');
  const body = `<section class="page-head"><div class="wrap"><h1>Política de privacidade</h1><p>Como a ${esc(BRAND.name)} trata os seus dados, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p></div></section>
<article class="wrap narrow legal">
  <p><em>Última atualização: ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}.</em></p>
  <h2>Quem somos</h2>
  <p>A ${esc(BRAND.name)}, ${ctx.units.length > 1 ? 'com lojas em' : 'localizada em'} ${ctx.units.map((u) => esc(`${u.address}, ${u.neighborhood} – ${u.city}`)).join(' e ')}, é a responsável (controladora) pelos dados coletados neste site.</p>
  <h2>Quais dados coletamos</h2>
  <ul>
    <li><strong>Formulários</strong> ("Venda seu carro" e "Me avise quando chegar"): nome, WhatsApp e as informações do carro que você digitar.</li>
    <li><strong>Conversas pelo WhatsApp</strong>: quando você toca em um botão do WhatsApp, a conversa acontece no aplicativo do WhatsApp, sujeita à política de privacidade dele.</li>
    <li><strong>Estatísticas de uso</strong>: contamos visitas de forma agregada (quantas pessoas viram cada página, de onde vieram e se usam celular ou computador). Para contar visitantes únicos usamos um código embaralhado que muda todo dia e não permite identificar você. Não usamos cookies para isso.</li>
    <li><strong>Favoritos e comparação</strong>: ficam salvos só no seu aparelho (armazenamento local do navegador) e não são enviados para nós.</li>
    ${s.ga_id ? '<li><strong>Google Analytics</strong>: só é ativado se você aceitar no aviso de cookies. Ele usa cookies do Google para medir o uso do site.</li>' : ''}
  </ul>
  <h2>Para que usamos</h2>
  <p>Para responder ao seu contato, avaliar o seu carro, avisar quando chegar o veículo que você procura e melhorar o site. A base legal é o seu consentimento e o nosso legítimo interesse em atender pedidos que você mesmo fez. Não vendemos nem compartilhamos seus dados com terceiros para publicidade.</p>
  <h2>Por quanto tempo guardamos</h2>
  <p>Os dados dos formulários ficam guardados enquanto forem necessários para o atendimento, e você pode pedir a exclusão a qualquer momento. As estatísticas são agregadas e não identificam pessoas.</p>
  <h2>Seus direitos</h2>
  <p>Você pode pedir para acessar, corrigir ou apagar seus dados, ou retirar o consentimento, ${contact || 'pelos nossos canais de atendimento'}.</p>
  <h2>Segurança</h2>
  <p>O site usa conexão segura (HTTPS) e o acesso aos dados é restrito à equipe da loja, com senha.</p>
</article>`;
  return layout({ title: 'Política de privacidade', body, ctx, canonical: '/privacidade' });
}

function notFound(ctx) {
  const body = `<section class="wrap empty" style="margin:64px auto"><h1>Página não encontrada</h1><p>O endereço pode ter mudado ou o veículo já foi retirado do site.</p><a class="btn btn-blue" href="/estoque">Ver estoque</a></section>`;
  return layout({ title: 'Página não encontrada', body, ctx });
}

module.exports = { home, stock, vehicle, sell, stores, notFound, favorites, compare, privacy };
