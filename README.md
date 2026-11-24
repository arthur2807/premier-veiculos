# Premier Veículos

Site e painel de estoque da Premier Veículos: seminovos, contato pelo WhatsApp.

> Para replicar para outra loja: troque `src/brand.js` (nome, textos, cores e lojas iniciais) e as logos em `public/img/`.

Feito só com Node.js (22.13 ou mais novo), sem dependências externas. O banco é SQLite (`node:sqlite`) e as fotos ficam salvas em disco.

## O que tem

- **Início**: busca rápida, destaques, últimos carros que chegaram e as duas lojas
- **Estoque** (`/estoque`): filtros por condição, marca, carroceria, preço, ano, km, câmbio, combustível e loja, além de ordenação
- **Página do veículo**: galeria de fotos que dá para deslizar, ficha técnica, opcionais, simulador de financiamento e botão "Tenho interesse", que abre o WhatsApp da loja onde o carro está com a mensagem já preenchida
- **Venda seu carro** (`/venda-seu-carro`): formulário de avaliação para troca. Os pedidos aparecem no painel
- **Nossas lojas** (`/lojas`): endereço, mapa, horário, WhatsApp e "Como chegar"
- **SEO**: título e descrição por página, dados estruturados (schema.org/Car), `sitemap.xml` e `robots.txt`
- **Painel** (`/admin`):
  - cadastro e edição de veículos
  - upload de fotos (são reduzidas no navegador antes de enviar) e reordenação, com a primeira como capa
  - situação de cada carro: disponível, reservado ou vendido
  - contatos recebidos
  - dados das lojas e configurações
  - quantas visitas e cliques no WhatsApp cada carro recebeu

### Novidades

- **Favoritos e comparação**: o visitante salva carros (coração) e compara até 3 lado a lado (`/comparar`). Fica guardado só no aparelho dele.
- **"Me avise quando chegar"**: formulário no estoque. Quando a loja cadastra um carro compatível, o painel mostra quem estava esperando, com botão para avisar no WhatsApp.
- **Política de privacidade (LGPD)** em `/privacidade` e aviso de cookies quando o Google Analytics estiver configurado.
- **Relatórios** no painel: visitantes, cliques no WhatsApp, origem das visitas, aparelho, buscas e carros mais procurados. A contagem é feita sem cookies (hash diário anônimo), e os acessos da equipe logada não entram.
- **Usuários**: o gerente cria acessos para os vendedores. Vendedor cadastra carros e atende contatos; gerente também altera lojas, configurações, usuários e baixa backup.
- **Marca d'água** opcional com a logo nas fotos novas.
- **Baixar backup**: arquivo `.tar.gz` com o banco e as fotos.
- **Painel de suporte** (`/suporte`): para o desenvolvedor do sistema. Entra com usuário e senha (`VENDOR_USER` e `VENDOR_PASSWORD`); só existe se `VENDOR_PASSWORD` estiver definida, não tem link em lugar nenhum e não mostra dados pessoais (nomes e telefones). Exibe a saúde do sistema, as estatísticas, o uso do painel pela loja e os erros do servidor.

### Desempenho dos anúncios (aba "Desempenho" no painel)

Por carro e por período (7, 30, 90 dias ou 12 meses): visitas, pessoas diferentes, compartilhamentos, cliques no WhatsApp, ligações, formulários, total de contatos e conversão, além do total de visitantes do site. Tem ordenação por coluna, busca, alertas automáticos (anúncio sem visita, muita visita e pouco contato, sem foto), planilha CSV e, ao clicar no carro, gráficos por dia, de onde vieram as pessoas e como compartilharam.

O botão **Compartilhar** na página do carro usa o menu do celular ou abre WhatsApp, Facebook e "copiar link". Os links compartilhados levam `?utm_source=compartilhado`, e as visitas que chegam por eles aparecem como "Link compartilhado".

### Perfis de acesso

| Perfil | Pode |
|---|---|
| Gerente | tudo (estoque, excluir, contatos, desempenho, relatórios, lojas, usuários, configurações, backup) |
| Vendedor | cadastrar/editar carros, contatos, desempenho (não exclui) |
| Marketing | ver estoque, desempenho e relatórios (sem dados de clientes, não altera nada) |
| Atendimento | ver estoque e atender contatos |

As permissões são conferidas no servidor (`src/roles.js`).

### Painel do proprietário (`/suporte`)

Saúde do sistema, requisições, tempo de resposta, erros e reinícios por dia (guardados no banco), funil do site, resultados para a loja (estoque, vendidos, tempo médio até vender, formulários), anúncios mais vistos e uso do painel por perfil e por pessoa. Entra com usuário (`VENDOR_USER`, padrão `suporte`) e senha (`VENDOR_PASSWORD`). Pelo `/suporte` também dá para criar usuários do painel da loja, trocar o perfil, redefinir a senha e desativar/reativar acessos (fica registrado na atividade como "suporte").

### Cobrança do site (no `/suporte`)

Três situações, trocadas com um clique pelo proprietário do software:

- **Normal**: tudo funcionando.
- **Aviso de atraso**: o site continua no ar e o painel da loja mostra uma faixa vermelha com a mensagem. Com uma data limite, o site é suspenso sozinho quando ela passa.
- **Suspenso**: o site público responde "temporariamente indisponível" (HTTP 503, sem menção a pagamento, com o WhatsApp e o telefone das lojas se você quiser) e o painel da loja fica bloqueado. A loja ainda entra para baixar o backup. Nada é apagado; voltar para "Normal" reativa tudo.

As mudanças ficam no registro de atividade como "suporte".

### Segurança

- Logins do painel ficam em sessões no banco: **Sair** encerra a sessão de verdade, e trocar a senha ou desativar um usuário o desconecta de todos os aparelhos. Se `ADMIN_PASSWORD` mudar, as sessões do "admin" caem no próximo deploy.
- O limite de tentativas de login e de envio de formulários usa o IP real do visitante (o último valor do `X-Forwarded-For`, que é o que o Railway coloca).
- Formulário de contato: até 5 envios a cada 10 minutos por IP. Cliques no WhatsApp contam 1 vez por carro a cada 30 minutos por IP.

### Miniaturas

Cada foto enviada ganha uma versão de ~560px (WebP) usada nos cards do estoque, servida em `/thumb/<arquivo>`. Se a miniatura não existir, o endereço entrega a foto original. Para fotos antigas, use **Configurações → Gerar miniaturas das fotos antigas** no painel.

## Rodar no computador

```bash
npm start
# abre em http://localhost:3000 e o painel em http://localhost:3000/admin (usuário `admin`, senha padrão `admin123`)
```

Na primeira vez, o banco é criado com duas lojas e 14 veículos de exemplo. No painel há um botão para **apagar os exemplos**.

## Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `ADMIN_USER` | Usuário do acesso principal do painel (padrão: `admin`) |
| `VENDOR_USER` | Usuário do painel de suporte `/suporte` (padrão: `suporte`) |
| `ADMIN_PASSWORD` | Senha do acesso "admin" (**obrigatória em produção**, 8+ caracteres; sem ela o login "admin" fica bloqueado no Railway) |
| `SESSION_SECRET` | Opcional. Texto aleatório para assinar o login do `/suporte` (se faltar, um valor aleatório é gerado e guardado no banco) |
| `DATA_DIR` | Pasta do banco e das fotos (no Railway: `/data`) |
| `PORT` | Definida automaticamente pelo Railway |
| `SEED_DEMO` | `false` para não criar veículos de exemplo |
| `VENDOR_PASSWORD` | Senha do painel de suporte `/suporte` (8+ caracteres). Sem ela, o painel não existe |
| `DEMO_PHOTOS` | `false` para não buscar fotos de exemplo no Wikipedia |

## Deploy no Railway

1. **New Project → Deploy from GitHub repo →** `premier-veiculos`
2. No serviço, crie um **Volume** montado em `/data`. Sem ele, o estoque e as fotos se perdem a cada deploy.
3. Em **Variables**, defina `DATA_DIR=/data`, `ADMIN_PASSWORD=...` e `SESSION_SECRET=...`
4. Em **Settings → Networking**, gere um domínio ou ligue o domínio próprio da loja
5. No painel do site, vá em **Lojas** e cadastre endereço, telefone e WhatsApp (formato `5585999998888`). Depois, em **Configurações**, coloque o endereço do site.

O Railway detecta o Node pelo `package.json` e roda `npm start`.

## Estrutura

```
src/server.js   rotas, API do painel, upload, sitemap
src/db.js       banco SQLite e dados iniciais
src/views.js    layout, cards e utilitários
src/pages.js    páginas públicas
public/         CSS, JS, logo e painel administrativo
```
