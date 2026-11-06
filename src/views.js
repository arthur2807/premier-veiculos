'use strict';
const BRAND = require('./brand');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

function vehicleUrl(v) {
  return `/veiculo/${v.id}-${slugify(`${v.brand} ${v.model} ${v.version} ${v.year_model}`)}`;
}
function vehicleTitle(v) { return `${v.brand} ${v.model}`; }
function photoUrl(v, i = 0) {
  return v.photos && v.photos[i] ? `/uploads/${v.photos[i]}` : `/placeholder/${v.id}.svg`;
}
function waLink(number, text) {
  const n = onlyDigits(number);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
function waVehicleText(v) {
  return `Olá! Vi no site e tenho interesse no ${v.brand} ${v.model} ${v.version} ${v.year_fab}/${v.year_model} (anúncio #${v.id}) por ${brl(v.price)}. Ainda está disponível?`;
}

const icons = {
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.4zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm8.4-18.2A11.8 11.8 0 0 0 1.7 17.8L0 24l6.3-1.7A11.8 11.8 0 0 0 24 12c0-3.2-1.2-6.1-3.5-8.4z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.5 2.1-.8 1.3L11 13V7h2z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4z"/></svg>',
  money: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 6h18v12H3zm9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 8v2a2 2 0 0 0 2-2zm12 0a2 2 0 0 0 2 2V8zm-12 8h2a2 2 0 0 0-2-2zm14 0v-2a2 2 0 0 0-2 2z"/></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11z"/></svg>',
  store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16l1 5a3 3 0 0 1-5 2.2A3 3 0 0 1 12 12a3 3 0 0 1-4-.8A3 3 0 0 1 3 9zm1 9.6V20h14v-6.4a4.9 4.9 0 0 1-3-.6 5 5 0 0 1-4 1 5 5 0 0 1-4-1 4.9 4.9 0 0 1-3 .6z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>',
  insta: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg>',
  compare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 3h2v18h-2v-2H4V5h6zm-4 4v10h4V7zm8-2h6v14h-6v-2h4V7h-4z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>'
};

function layout({ title, description, body, ctx, canonical = '', ogImage = '', active = '', head = '' }) {
  const { settings, units } = ctx;
  const site = settings.site_url ? settings.site_url.replace(/\/$/, '') : '';
  const fullTitle = title ? `${title} | ${BRAND.name}` : `${BRAND.name} | ${BRAND.tagline}`;
  const desc = description || `${BRAND.name}: ${BRAND.about}`;
  const nav = [
    ['/', 'Início', 'home'],
    ['/estoque', 'Estoque', 'estoque'],
    ['/estoque?condicao=seminovo', 'Seminovos', 'seminovo'],
    ['/estoque?condicao=0km', '0 km', '0km'],
    ['/venda-seu-carro', 'Venda seu carro', 'venda'],
    ['/lojas', 'Nossas lojas', 'lojas']
  ];
  const unitsWa = units.filter((u) => onlyDigits(u.whatsapp).length >= 10);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="${BRAND.colors.dark}">
${canonical && site ? `<link rel="canonical" href="${esc(site + canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
${ogImage && site ? `<meta property="og:image" content="${esc(site + ogImage)}">` : ''}
<link rel="icon" href="/static/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:ital,wght@0,600;0,700;0,800;1,800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/css/style.css?v=6">
<link rel="stylesheet" href="/theme.css?v=1">
${head}
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-in">
    <a href="/" class="brand" aria-label="${esc(BRAND.name)}, página inicial"><img src="/static/img/logo-400.png" alt="${esc(BRAND.name)}" width="168" height="68"></a>
    <nav class="mainnav" id="mainnav" aria-label="Principal">
      ${nav.map(([h, l, k]) => `<a href="${h}"${active === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
    </nav>
    <a class="fav-link" href="/favoritos" aria-label="Meus favoritos">${icons.heart}<span class="fav-count" hidden>0</span></a>
    <button class="btn-wa btn-sm js-wa-open" type="button">${icons.wa}<span>WhatsApp</span></button>
    <button class="menu-btn" type="button" aria-label="Abrir menu" aria-controls="mainnav" aria-expanded="false">${icons.menu}</button>
  </div>
</header>
<main>
${body}
</main>
<footer class="footer">
  <div class="wrap footer-grid">
    <div>
      <img src="/static/img/logo-branca-400.png" alt="${esc(BRAND.name)}" width="168" height="68" class="footer-logo">
      <p>${esc(settings.about)}</p>
      ${settings.instagram ? `<a class="social" href="${esc(settings.instagram)}" target="_blank" rel="noopener">${icons.insta} Instagram</a>` : ''}
    </div>
    ${units.map((u) => `<div class="footer-unit">
      <h3>${esc(u.name)}</h3>
      <p>${icons.pin}<span>${esc(u.address)}${u.neighborhood ? ` · ${esc(u.neighborhood)}` : ''}<br>${esc(u.city)}</span></p>
      ${u.phone ? `<p>${icons.phone}<a href="tel:${onlyDigits(u.phone)}">${esc(u.phone)}</a></p>` : ''}
      ${u.hours ? `<p>${icons.clock}<span>${esc(u.hours)}</span></p>` : ''}
    </div>`).join('')}
  </div>
  <div class="wrap footer-bottom">
    <span>© ${new Date().getFullYear()} ${esc(BRAND.name)}. Todos os direitos reservados.</span>
    <span><a href="/privacidade">Política de privacidade</a> · Preços e condições sujeitos a alteração sem aviso prévio.</span>
  </div>
</footer>

<button class="wa-float js-wa-open" type="button" aria-label="Falar no WhatsApp">${icons.wa}</button>
<div class="wa-sheet" id="wa-sheet" hidden>
  <div class="wa-sheet-card" role="dialog" aria-modal="true" aria-labelledby="wa-title">
    <button class="wa-close" type="button" aria-label="Fechar">×</button>
    <h2 id="wa-title">Fale com a gente</h2>
    <p>Escolha a loja mais perto de você:</p>
    ${unitsWa.length ? unitsWa.map((u) => `<a class="wa-unit" data-wa="${onlyDigits(u.whatsapp)}" href="${waLink(u.whatsapp, `Olá! Vim pelo site da ${BRAND.name} (${u.name}).`)}" target="_blank" rel="noopener">
      ${icons.wa}<span><strong>${esc(u.name)}</strong><small>${esc(u.neighborhood || u.address)}</small></span></a>`).join('') : '<p>Cadastre o WhatsApp das lojas no painel.</p>'}
  </div>
</div>
<div class="cmp-bar" id="cmp-bar" hidden><span><strong class="js-cmp-n">0</strong> carro(s) para comparar</span><button type="button" class="link js-cmp-clear">Limpar</button><a class="btn btn-red" href="/comparar">Comparar</a></div>
${settings.ga_id && /^G-[A-Z0-9]{4,}$/.test(settings.ga_id) ? `<div class="consent" id="consent" hidden data-ga="${esc(settings.ga_id)}"><p>Usamos cookies de estatística (Google Analytics) para melhorar o site. <a href="/privacidade">Saiba mais</a></p><div><button type="button" class="btn btn-ghost js-consent" data-v="0">Recusar</button><button type="button" class="btn btn-blue js-consent" data-v="1">Aceitar</button></div></div>` : ''}
<script src="/static/js/site.js?v=4" defer></script>
</body>
</html>`;
}

function badge(v) {
  if (v.status === 'vendido') return '<span class="badge badge-sold">Vendido</span>';
  if (v.status === 'reservado') return '<span class="badge badge-res">Reservado</span>';
  if (v.condition === '0km') return '<span class="badge badge-new">0 km</span>';
  if (v.featured) return '<span class="badge badge-feat">Destaque</span>';
  return '';
}

function card(v, unitsById) {
  const unit = unitsById[v.unit_id];
  return `<article class="card" data-id="${v.id}">
  <a href="${vehicleUrl(v)}" class="card-img">
    <img src="${photoUrl(v)}" alt="${esc(`${v.brand} ${v.model} ${v.version} ${v.year_model}`)}" loading="lazy" width="640" height="440">
    ${badge(v)}
  </a>
  <div class="card-tools">
    <button type="button" class="tool js-fav" data-id="${v.id}" aria-label="Salvar nos favoritos" aria-pressed="false">${icons.heart}</button>
    <button type="button" class="tool js-cmp" data-id="${v.id}" aria-label="Adicionar à comparação" aria-pressed="false">${icons.compare}</button>
  </div>
  <div class="card-body">
    <h3><a href="${vehicleUrl(v)}">${esc(vehicleTitle(v))}</a></h3>
    <p class="card-version">${esc(v.version)}</p>
    <ul class="chips">
      <li>${v.year_fab}/${v.year_model}</li>
      <li>${v.condition === '0km' ? '0 km' : `${num(v.km)} km`}</li>
      <li>${esc(v.transmission)}</li>
    </ul>
    <div class="card-price">
      ${v.price_old > v.price ? `<s>${brl(v.price_old)}</s>` : ''}
      <strong>${v.price ? brl(v.price) : 'Consulte'}</strong>
    </div>
    ${unit ? `<p class="card-unit">${icons.pin}${esc(unit.name)}</p>` : ''}
  </div>
</article>`;
}

module.exports = { esc, brl, num, slugify, onlyDigits, vehicleUrl, vehicleTitle, photoUrl, waLink, waVehicleText, icons, layout, card, badge };
