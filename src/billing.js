'use strict';
// Situação de cobrança do site, controlada só pelo painel /suporte (proprietário do software).
//   ok       → tudo normal
//   aviso    → o painel da loja mostra um aviso de mensalidade em atraso; o site continua no ar.
//              Se houver data limite e ela passar, vira "suspenso" sozinho.
//   suspenso → o site público mostra uma página de "temporariamente indisponível" (HTTP 503) e o
//              painel da loja fica bloqueado (só entrar, sair e baixar backup). Nada é apagado.
const { db } = require('./db');
const { today } = require('./analytics');

db.exec('CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT)');

const DEFAULTS = {
  aviso: 'A mensalidade do sistema está em atraso. Regularize o pagamento para evitar a suspensão do site.',
  suspenso: 'O site e o painel estão suspensos por falta de pagamento da mensalidade. Fale com a CVT Tech para reativar. Nenhum dado foi apagado.'
};
const STATUSES = ['ok', 'aviso', 'suspenso'];

function read() {
  try {
    const r = db.prepare("SELECT value FROM system_state WHERE key='billing'").get();
    const s = r ? JSON.parse(r.value) : {};
    return { status: STATUSES.includes(s.status) ? s.status : 'ok', message: s.message || '', deadline: s.deadline || '', showContacts: s.showContacts !== false, updatedAt: s.updatedAt || '' };
  } catch { return { status: 'ok', message: '', deadline: '', showContacts: true, updatedAt: '' }; }
}

// cache curto: a situação é lida em toda requisição
let cache = null, cacheAt = 0;
/** Situação em vigor agora (aviso com data limite vencida = suspenso). */
function state() {
  if (!cache || Date.now() - cacheAt > 5000) { cache = read(); cacheAt = Date.now(); }
  const s = { ...cache };
  s.autoSuspended = s.status === 'aviso' && !!s.deadline && today() > s.deadline;
  s.effective = s.autoSuspended ? 'suspenso' : s.status;
  s.text = s.message || DEFAULTS[s.effective] || '';
  if (s.autoSuspended && !s.message) s.text = DEFAULTS.suspenso;
  return s;
}

/** Grava a situação. Retorna o estado novo ou lança erro com status 400. */
function save(b) {
  const status = STATUSES.includes(b.status) ? b.status : null;
  if (!status) throw Object.assign(new Error('Situação inválida'), { status: 400 });
  const deadline = String(b.deadline || '').trim();
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw Object.assign(new Error('Data limite inválida'), { status: 400 });
  const value = {
    status,
    message: String(b.message || '').trim().slice(0, 500),
    deadline: status === 'aviso' ? deadline : '',
    showContacts: b.showContacts !== false,
    updatedAt: new Date().toISOString()
  };
  db.prepare("INSERT INTO system_state(key,value) VALUES('billing',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));
  cache = null;
  return state();
}

module.exports = { state, save, DEFAULTS };
