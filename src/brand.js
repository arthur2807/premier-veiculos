'use strict';
// Identidade da loja. Para replicar o site para outra loja, troque este arquivo e as logos em public/img/.
module.exports = {
  name: 'Premier Veículos',
  slogan: 'Aqui é o lugar para comprar seu carro novo!',
  slug: 'premier-veiculos',
  tagline: 'Seminovos em João Pessoa',
  heroTitle: 'O seu próximo carro<br><em>está aqui.</em>',
  about: 'Na Premier Veículos, em João Pessoa, você encontra seminovos selecionados, com procedência garantida, financiamento facilitado e avaliação justa do seu usado na troca.',
  email: '',
  instagram: 'https://instagram.com/premierveiculosjp',
  // Cores do site (preto, prata e vermelho da logo)
  colors: {
    dark: '#121212',
    primary: '#262626',
    primary2: '#3a3a3a',
    accent: '#d42a1c',
    accent2: '#b0200f',
    accentSoft: '#ff9a8f',
    accentBright: '#ff4a3a',
    hero1: '#050505', hero2: '#1c1414', hero3: '#3a0d08', heroGlow: '#5a120a',
    footer: '#0a0a0a',
    onDarkMuted: '#d2d2d2'
  },
  // Lojas iniciais (podem ser editadas, adicionadas ou removidas no painel)
  units: [
    {
      name: 'Premier Veículos', address: 'Av. Geminiano da Franca, 899', neighborhood: 'Torre', city: 'João Pessoa - PB',
      phone: '(83) 99162-7878', whatsapp: '5583991627878',
      hours_json: [...Array(5)].map(() => ({ open: '08:00', close: '18:00' })).concat([{ open: '08:00', close: '13:00' }, null])
    }
  ]
};
