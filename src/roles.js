'use strict';
// Perfis de acesso do painel da loja. As permissões são conferidas no servidor (rotas da API)
// e a interface só esconde o que o perfil não pode usar.

const PERMISSIONS = {
  estoque: 'Ver o estoque',
  estoque_editar: 'Cadastrar e editar veículos e fotos',
  estoque_excluir: 'Excluir veículos',
  contatos: 'Ver e atender contatos (nomes e telefones)',
  desempenho: 'Ver o desempenho dos anúncios',
  relatorios: 'Ver os relatórios do site',
  lojas: 'Alterar dados das lojas',
  usuarios: 'Criar e gerenciar usuários',
  config: 'Alterar configurações do site',
  backup: 'Baixar backup'
};

const ROLES = {
  gerente: {
    label: 'Gerente',
    description: 'Acesso completo: estoque, contatos, relatórios, lojas, usuários, configurações e backup.',
    perms: Object.keys(PERMISSIONS)
  },
  vendedor: {
    label: 'Vendedor',
    description: 'Cadastra e edita carros, atende os contatos e acompanha o desempenho dos anúncios. Não exclui carros.',
    perms: ['estoque', 'estoque_editar', 'contatos', 'desempenho']
  },
  marketing: {
    label: 'Marketing',
    description: 'Acompanha o desempenho dos anúncios e os relatórios do site. Vê o estoque, mas não altera nada e não vê dados de clientes.',
    perms: ['estoque', 'desempenho', 'relatorios']
  },
  atendimento: {
    label: 'Atendimento',
    description: 'Atende os contatos que chegam pelo site e consulta o estoque. Não altera carros.',
    perms: ['estoque', 'contatos']
  }
};

const roleOf = (r) => (ROLES[r] ? r : 'vendedor');
const permsOf = (user) => (user ? ROLES[roleOf(user.role)].perms : []);
const can = (user, perm) => permsOf(user).includes(perm);

module.exports = { ROLES, PERMISSIONS, roleOf, permsOf, can };
