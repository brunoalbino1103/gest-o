# Sistema Contábil — piloto

Sistema único para o escritório, com **Departamento Fiscal**, **Departamento Pessoal** e **Contabilidade**:

- **Visão geral**: quanto do mês já foi feito, o que está atrasado, o que vence em 7 dias e um mapa de todos os clientes × departamentos.
- **Departamentos**: uma matriz cliente × obrigação do mês. Clique numa célula para marcar pendente / em andamento / concluída / não se aplica, escolher responsável e deixar observação. Dá para concluir uma obrigação em lote e exportar para Excel.
- **Clientes**: cadastro completo (CNPJ, regime, inscrições, e-mails, responsáveis por departamento), importação da lista inteira por planilha Excel/CSV e ficha de cada cliente com tarefas, documentos, notas e histórico.
- **Documentos**: arraste arquivos ou uma pasta inteira. O sistema lê **XML de NF-e, NFC-e, NFS-e e CT-e** (cliente pelo CNPJ, valor, impostos, saída/entrada, nota repetida é ignorada), **extratos OFX** e reconhece guias, holerites, atestados etc. pelo nome do arquivo. Você confere numa tabela antes de enviar.
- **Painel Fiscal** (`fiscal.html`): o mesmo Painel Fiscal de antes (Visão Geral, Notas Fiscais, Canceladas, Devoluções, DIFAL por Estado, Qualidade de Dados, Curva ABC, Comparativo entre Meses, Notas Faltando e Fretes por Estado), agora por cliente e montado sozinho a partir dos XML importados. Categoria pelo CFOP, cancelamentos pelos eventos e "Notas Faltando" cruzando com as inutilizações.
- **Configurações**: obrigações que geram as tarefas (mensais, trimestrais ou anuais; prazo em dia do mês, dia útil ou último dia útil; antecipa/prorroga em fim de semana e feriado), feriados municipais/estaduais, equipe e geração das tarefas da competência.

Tudo roda com **Supabase** (banco, login e arquivos) e é um site estático, que pode ficar no **GitHub Pages** agora e em qualquer hospedagem depois.

---

## 1. Testar agora, sem instalar nada (modo demonstração)

Enquanto `js/config.js` estiver sem os dados do Supabase, o sistema abre com 12 clientes fictícios e tudo fica só no seu navegador.

1. Clique com o botão direito em `ferramentas\servidor-local.ps1` › **Executar com o PowerShell**.
2. Abra **http://localhost:8766** no navegador e clique em **Entrar**.

> Abrir o `index.html` com dois cliques não funciona: o navegador bloqueia os módulos quando a página é um arquivo. Use o servidor local (ou o site publicado).

---

## 2. Ligar o Supabase (banco de verdade)

1. Crie uma conta em https://supabase.com e um **New project**. Em *Region*, escolha **South America (São Paulo)**. Guarde a senha do banco.
2. No projeto, abra **SQL Editor › New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Isso cria as tabelas, as regras de segurança, o armazenamento privado `documentos` e as obrigações iniciais.
3. **Authentication › Sign In / Providers**: desligue **Allow new users to sign up**. Só quem for convidado entra.
4. **Authentication › Users › Invite user**: convide o seu e-mail. Abra o e-mail e crie a senha.
5. Torne-se administrador. Em **SQL Editor**, rode (trocando o e-mail):
   ```sql
   update public.perfis set departamento = 'admin', nome = 'Seu nome' where email = 'seu@email.com';
   ```
6. **Project Settings › API**: copie **Project URL** e a chave **anon public** e cole em `js/config.js`:
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   export const NOME_ESCRITORIO = 'Nome do escritório';
   ```
   A chave *anon* foi feita para ficar no site. Quem protege os dados são as regras do banco: só usuários convidados e ativos leem ou gravam qualquer coisa. **Nunca** coloque a chave *service_role* no site.
7. Teste de novo com o servidor local, agora entrando com seu e-mail e senha.
8. Depois de publicar (passo 3), volte em **Authentication › URL Configuration** e coloque o endereço do site em **Site URL**, para os links de convite e de "esqueci a senha" apontarem para ele.

**Equipe:** convide cada pessoa em *Authentication › Users › Invite user*. Ela aparece em **Configurações › Equipe**, onde você escolhe o departamento ou tira o acesso.

**Primeiro uso:** Clientes › **Importar planilha** (há uma planilha modelo para baixar). Em Configurações, clique em **Carregar obrigações sugeridas**, confira os prazos do seu município/estado, cadastre os feriados locais e clique em **Gerar tarefas** da competência. Depois importe os XML em Documentos e abra o **Painel Fiscal**.

---

## 3. Publicar no GitHub Pages

1. Crie uma conta em https://github.com e um **New repository** (ex.: `sistema-contabil`).
   - O GitHub Pages gratuito exige repositório **Public**. O código fica visível, mas **nenhum dado** fica no GitHub: clientes, notas e arquivos estão no Supabase, protegidos por login. Para repositório privado com Pages é preciso um plano pago do GitHub.
2. No repositório: **Add file › Upload files** e arraste **o conteúdo** desta pasta (`index.html`, `css`, `js`, `supabase`, `ferramentas`, `LEIAME.md`). Clique em **Commit changes**.
3. **Settings › Pages**: em *Source* escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
4. Em 1 a 2 minutos o site fica em `https://SEU-USUARIO.github.io/sistema-contabil/`.
5. Para atualizar depois, envie de novo só os arquivos alterados (Upload files substitui os de mesmo nome).

---

## Limites do plano gratuito (importante para 300 clientes)

| | Supabase Free | Supabase Pro (US$ 25/mês) |
|---|---|---|
| Banco | 500 MB | 8 GB |
| Arquivos | 1 GB, até 50 MB por arquivo | 100 GB |
| Pausa | o projeto pausa após 7 dias sem uso | não pausa |

O plano gratuito serve para o **piloto** (alguns clientes e meses). Com 300 clientes guardando XML, guias e holerites todo mês, 1 GB acaba rápido: para valer de verdade, use o Pro ou outra hospedagem. Os dados podem ser levados junto.

**Dados pessoais (LGPD):** holerites, atestados e pontos têm dados sensíveis de funcionários dos clientes. O banco fica em São Paulo, os arquivos ficam num armazenamento privado (só abrem com login, por links que expiram em 5 minutos), e cada ação importante fica registrada no histórico.

---

## Estrutura

```
index.html              sistema (visão geral, departamentos, clientes, documentos, configurações)
fiscal.html             Painel Fiscal original, por cliente (js/fiscal/painel.js + js/fiscal/carregar.js)
abrir.html              abre um documento por link temporário (comprovantes do painel)
css/fontes.css          fonte Poppins, a mesma dos painéis
js/regras.js            prazos: dias úteis, feriados, periodicidade, obrigações sugeridas
css/app.css             visual
js/config.js            endereço e chave do Supabase  ← editar
js/app.js               menu, login e troca de telas
js/db.js                escolhe Supabase ou modo demonstração
js/db-supabase.js       acesso ao Supabase
js/db-demo.js           dados fictícios (modo demonstração)
js/leitor.js            leitura de XML, OFX, planilhas e nomes de arquivo
js/telas/*.js           cada tela (painel, departamento, clientes, cliente, documentos, configurações)
supabase/schema.sql     estrutura do banco e regras de segurança
ferramentas/servidor-local.ps1   servidor para testar no computador
```

## Próximos passos sugeridos (depois de validar o piloto)

- Fiscal: apuração do Simples a partir das notas importadas e conferência das notas faltando na sequência.
- Pessoal: cadastro de funcionários por cliente, férias e experiência (aproveitando o painel de ponto atual).
- Contabilidade: conciliação a partir do OFX.
- Envio de guias e holerites por e-mail ao cliente direto do sistema.
- Portal para o cliente mandar os documentos sozinho.

## Atualizações do banco (rodar uma vez, na ordem)
No Supabase: SQL Editor → New query → cole o conteúdo do arquivo → Run.
1. `supabase/atualizacao-01-pessoal.sql` (já rodado)
2. `supabase/atualizacao-02-importacao.sql` (já rodado)
3. `supabase/atualizacao-03-dp-completo.sql` — ficha completa, eventos, SST, tabelas INSS/IRRF
4. `supabase/atualizacao-04-portal.sql` — portal do cliente

## Portal do cliente
1. No sistema: ⚙ Cadastros → Portal do cliente → Acessos → + Acesso (e-mail do cliente + empresa).
2. No Supabase: Authentication → Users → Add user, com o mesmo e-mail e uma senha (marque Auto Confirm User).
3. O cliente entra no mesmo endereço do sistema e vê só a empresa dele.
Um e-mail cadastrado no portal nunca vira usuário da equipe. Cadastre o acesso ANTES de criar o usuário.