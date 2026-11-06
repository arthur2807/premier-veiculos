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
- **Painel de suporte** (`/suporte`): para o desenvolvedor do sistema. Só existe se a variável `VENDOR_PASSWORD` estiver definida, não tem link em lugar nenhum e não mostra dados pessoais (nomes e telefones). Exibe a saúde do sistema, as estatísticas, o uso do painel pela loja e os erros do servidor.

## Rodar no computador

```bash
npm start
# abre em http://localhost:3000 e o painel em http://localhost:3000/admin (senha padrão: admin123)
```

Na primeira vez, o banco é criado com duas lojas e 14 veículos de exemplo. No painel há um botão para **apagar os exemplos**.

## Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `ADMIN_PASSWORD` | Senha do painel (**obrigatória em produção**) |
| `SESSION_SECRET` | Texto aleatório longo para assinar o login |
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
