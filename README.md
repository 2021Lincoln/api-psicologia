# Marketplace de Psicologia

Plataforma completa para conectar pacientes com psicólogas, com agendamento online, videochamada integrada e pagamento via Stripe.

---

## Sumário

- [Stack tecnológica](#stack-tecnológica)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
- [Pré-requisitos](#pré-requisitos)
- [Instalação e configuração](#instalação-e-configuração)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Rodando o projeto](#rodando-o-projeto)
- [Guia de teste prático (PC + celular)](#guia-de-teste-prático-pc--celular)
- [Para a psicóloga — explicação simplificada](#para-a-psicóloga--explicação-simplificada)
- [Migrações de banco de dados](#migrações-de-banco-de-dados)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Rotas da API](#rotas-da-api)
- [Papéis e permissões](#papéis-e-permissões)
- [Fluxo completo de agendamento](#fluxo-completo-de-agendamento)

---

## Stack tecnológica

### Backend

| Tecnologia | Versão | Papel |
|---|---|---|
| **Python** | 3.12+ | Linguagem principal |
| **FastAPI** | 0.111+ | Framework web assíncrono |
| **SQLModel** | 0.0.18+ | ORM (baseado em SQLAlchemy + Pydantic) |
| **SQLAlchemy** | 2.x | Engine async (asyncpg) |
| **PostgreSQL** | 15+ | Banco de dados relacional |
| **asyncpg** | 0.29 | Driver async PostgreSQL |
| **Alembic** | 1.18 | Migrações de banco de dados |
| **Pydantic v2** | 2.x | Validação de dados e schemas |
| **pydantic-settings** | 2.x | Configuração via `.env` |
| **python-jose** | — | Geração e validação de JWT |
| **passlib[bcrypt]** | — | Hash de senhas |
| **Stripe** | — | Pagamentos e webhooks |
| **Daily.co** | — | Salas de videochamada |
| **Resend** | — | Envio de e-mails transacionais (opcional) |
| **Twilio** | — | Notificações WhatsApp (opcional) |
| **uvicorn** | — | Servidor ASGI |

### Frontend

| Tecnologia | Versão | Papel |
|---|---|---|
| **Next.js** | 14 (App Router) | Framework React com SSR/CSR |
| **React** | 18 | UI library |
| **TypeScript** | 5 | Tipagem estática |
| **Tailwind CSS** | 3.4 | Estilização utilitária |
| **tailwindcss-animate** | 1.0.7 | Animações CSS (slide, fade, zoom) |
| **TanStack Query** | 5 | Cache e estado servidor |
| **Lucide React** | — | Ícones SVG |
| **clsx + tailwind-merge** | — | Utilitário de classes condicionais (`cn()`) |
| **class-variance-authority** | — | Variantes de componentes |
| **Radix UI** | — | Primitivos de acessibilidade |

---

## Arquitetura

```
api-psicologia/
├── main.py                     # Entrypoint FastAPI
├── .env                        # Variáveis de ambiente (não versionar)
├── .env.example                # Template de variáveis
├── requirements.txt            # Dependências Python (pinadas com hash)
│
├── app/
│   ├── api/
│   │   ├── deps.py             # Dependências de auth e RBAC
│   │   └── v1/
│   │       ├── auth.py         # Login, registro, refresh, /me, avatar, senha
│   │       ├── psychologists.py # CRUD de psicólogas, disponibilidade, slots, notas
│   │       ├── appointments.py  # Agendamentos (criar, listar, cancelar, join)
│   │       ├── payments.py      # Checkout Stripe + mock-pay + webhook
│   │       ├── reviews.py       # Avaliações de consultas
│   │       ├── video.py         # Salas Daily.co
│   │       └── admin.py         # Stats e gestão administrativa
│   ├── core/
│   │   ├── config.py           # Settings (pydantic-settings)
│   │   └── security.py         # JWT encode/decode, hash de senhas
│   ├── db/
│   │   └── session.py          # Engine async + SessionLocal
│   ├── models/
│   │   └── domain.py           # Modelos SQLModel + schemas Pydantic
│   └── services/
│       ├── appointment.py      # Lógica: validação de slots, conflitos, timezone
│       ├── schedule.py         # Cálculo de slots disponíveis, cancelamento
│       ├── payment.py          # Integração Stripe
│       ├── video.py            # Criação de salas Daily.co
│       └── notifications.py    # E-mail (Resend) e WhatsApp (Twilio)
│
├── migrations/
│   ├── env.py                  # Config async do Alembic
│   └── versions/               # Arquivos de migração
│
├── scripts/
│   └── make_admin.py           # Promove usuário para role=admin
│
└── frontend/
    ├── next.config.js          # Proxy /api/v1/* → backend
    ├── tailwind.config.js
    ├── app/
    │   ├── layout.tsx           # Root layout com ConditionalShell
    │   ├── page.tsx             # Home: lista de psicólogas com filtros
    │   ├── login/page.tsx
    │   ├── register/page.tsx
    │   ├── psicologas/[id]/page.tsx   # Perfil público + horários disponíveis
    │   ├── checkout/[id]/page.tsx     # Confirmar e pagar agendamento
    │   ├── booking/
    │   │   ├── success/page.tsx       # Retorno do Stripe após pagamento
    │   │   └── cancel/page.tsx        # Retorno do Stripe após abandono
    │   └── dashboard/
    │       ├── paciente/        # Dashboard + perfil do paciente
    │       ├── psicologa/       # Dashboard + disponibilidade + perfil da psicóloga
    │       └── admin/           # Painel administrativo
    ├── components/
    │   ├── conditional-shell.tsx # NavBar condicional
    │   ├── page-transition.tsx   # Transição de página
    │   ├── dashboard/sidebar.tsx # Sidebar com drawer mobile
    │   └── ui/                   # Sistema de design: button, card, badge, toast, etc.
    ├── providers/
    │   ├── providers.tsx         # QueryClient + AuthProvider + ToastProvider
    │   └── auth-context.tsx      # Contexto de autenticação JWT
    └── lib/
        ├── auth.ts               # Helpers: getToken, authHeaders, clearAuth
        ├── utils.ts              # cn() — clsx + tailwind-merge
        └── query-client.ts       # Instância TanStack Query
```

---

## Funcionalidades

### Pacientes
- Cadastro e login com JWT
- Busca de psicólogas com filtros (especialidade, faixa de preço)
- Visualização de perfil público e horários disponíveis por data
- Agendamento com validação de disponibilidade e conflitos
- Pagamento via Stripe Checkout ou simulação (modo teste)
- Entrada na sala de videochamada 5 minutos antes da sessão
- Dashboard: countdown ao vivo, timeline de agendamentos, contadores animados
- Cancelamento de consulta
- **Avaliação pós-consulta** com nota (1–5 estrelas) e comentário anônimo
- **Perfil pessoal**: foto de perfil, nome, telefone, troca de senha

### Psicólogas
- Cadastro com número de CRP
- Criação e edição de perfil (bio, especialidades, valor/hora, duração da sessão)
- Upload de foto de perfil
- Gerenciamento de disponibilidade por data específica e janelas de horário
- Dashboard: barra de progresso de conclusão de perfil, countdown da próxima sessão, gráfico de receita semanal, timeline de pacientes
- **Lembretes privados** (post-its coloridos com edição inline)
- **Aceitando/não aceitando pacientes**: toggle que oculta a agenda da busca
- Troca de senha

### Administradores
- Painel com KPIs animados: usuários, psicólogas, agendamentos
- Fila de verificação de CRP com modal de confirmação
- Aprovar ou reprovar psicólogas (link direto ao `cadastro.cfp.org.br`)
- Badge animado na sidebar com contagem de pendentes

### Sistema
- Autenticação JWT: access token (30 min) + refresh token (7 dias) com rotação
- RBAC — 3 papéis: `patient`, `psychologist`, `admin`
- Toasts globais com auto-dismiss
- Transições de página com slide + fade
- Layout responsivo — sidebar no desktop, drawer no mobile

---

## Pré-requisitos

- **Python 3.12+**
- **PostgreSQL 15+** (serviço rodando)
- **Node.js 18+** e **npm**
- Contas com chaves de API (apenas Stripe e Daily.co são obrigatórios para produção):
  - [Stripe](https://stripe.com)
  - [Daily.co](https://daily.co)
  - [Resend](https://resend.com) — opcional, e-mails
  - [Twilio](https://twilio.com) — opcional, WhatsApp

---

## Instalação e configuração

### 1. Clonar o repositório

```bash
git clone <url-do-repositorio>
cd api-psicologia
```

### 2. Configurar e instalar o backend

```bash
# Criar virtualenv
python -m venv .venv

# Ativar — Windows
.venv\Scripts\activate
# Ativar — Linux/macOS
source .venv/bin/activate

# Instalar dependências
pip install -r requirements.txt
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com seus valores reais
```

### 4. Criar o banco de dados PostgreSQL

```sql
-- Via psql ou pgAdmin
CREATE DATABASE psicologia;
```

### 5. Executar as migrações

```bash
alembic upgrade head
```

### 6. Instalar o frontend

```bash
cd frontend
npm install
```

---

## Variáveis de ambiente

Arquivo `.env` na raiz do projeto:

```env
# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/psicologia

# ── JWT ──────────────────────────────────────────────────────────────────────
# Gerar com: openssl rand -hex 32
JWT_SECRET_KEY=troque-por-uma-chave-forte-de-64-chars
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Daily.co ──────────────────────────────────────────────────────────────────
DAILY_API_KEY=...

# ── Redirect após pagamento ───────────────────────────────────────────────────
FRONTEND_SUCCESS_URL=http://localhost:3000/booking/success
FRONTEND_CANCEL_URL=http://localhost:3000/booking/cancel

# ── Notificações (opcionais) ──────────────────────────────────────────────────
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@seu-dominio.com

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

> Nunca versione o `.env`. Ele já está no `.gitignore`.

---

## Rodando o projeto

### Iniciar o PostgreSQL (Windows)

```powershell
# PowerShell como Administrador
Start-Service -Name (Get-Service postgresql* | Select-Object -First 1 -ExpandProperty Name)
```

Ou via `services.msc`: procure `postgresql-x64-*` → botão direito → **Iniciar**.

### Iniciar o backend

```bash
# Na raiz do projeto, com .venv ativado
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API: `http://localhost:8000`
- Documentação Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Iniciar o frontend (com acesso pelo celular)

```bash
cd frontend
npm run dev -- -H 0.0.0.0
```

- No computador: `http://localhost:3000`
- No celular (mesma rede Wi-Fi): `http://<IP-DO-COMPUTADOR>:3000`

> Para descobrir o IP do computador no Windows: abra o Prompt de Comando e execute `ipconfig`. Procure por **Endereço IPv4** em "Adaptador de Rede sem Fio Wi-Fi" — geralmente `192.168.x.x`.

---

## Guia de teste prático (PC + celular)

Este guia permite testar o fluxo completo: você como **psicóloga no computador** e como **paciente no celular**, incluindo o agendamento, pagamento e avaliação.

> **Sem Stripe configurado?** Sem problema. O botão "Simular pagamento (Teste)" no checkout funciona sem nenhuma chave Stripe — cria a sala de vídeo e confirma o pagamento instantaneamente.

---

### Etapa 1 — Preparação (uma vez só)

#### 1.1 Inicie os servidores

```bash
# Terminal 1 — backend (raiz do projeto, .venv ativado)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — frontend (pasta frontend/)
npm run dev -- -H 0.0.0.0
```

#### 1.2 Descubra o IP do computador

```
ipconfig
# → Endereço IPv4: 192.168.x.x (anote esse número)
```

#### 1.3 Crie a conta da psicóloga

Acesse `http://localhost:3000/register` e crie uma conta com papel **Psicóloga (psychologist)**.

#### 1.4 Crie uma conta de administrador

Crie uma conta normal no registro e depois promova-a via terminal:

```bash
# Na raiz do projeto, com .venv ativado
python scripts/make_admin.py admin@seusite.com
```

#### 1.5 Aprove o CRP da psicóloga

1. Faça login com a conta admin em `http://localhost:3000`
2. Você será redirecionada para o painel administrativo
3. Clique em **Verificar CRP** (ou acesse `/dashboard/admin`)
4. Encontre a psicóloga na fila e clique em **Aprovar**

---

### Etapa 2 — Configurar o perfil da psicóloga (no computador)

1. Faça login como psicóloga
2. Vá em **Meu Perfil** → Preencha bio, especialidades, valor por hora, duração da sessão
3. Ative o toggle **"Aceitando novos pacientes"**
4. Clique em **Salvar perfil**

---

### Etapa 3 — Criar disponibilidade para hoje (no computador)

1. No painel da psicóloga, clique em **Minha agenda** (ou acesse `/dashboard/psicologa/disponibilidade`)
2. Navegue até o mês atual
3. Clique no dia de hoje no calendário
4. Defina um horário de início e fim (ex: `08:00` às `18:00`)
5. Clique em **Adicionar** → Salve

> Os horários disponíveis são gerados automaticamente a partir dessa janela. Se a sessão durar 50 min e a janela for das 08:00 às 10:00, serão criados os slots 08:00 e 09:00.

---

### Etapa 4 — Agendar como paciente (no celular)

1. No celular, conecte-se ao **mesmo Wi-Fi** do computador
2. Abra o navegador e acesse `http://192.168.x.x:3000` (use o IP anotado no passo 1.2)
3. Cadastre-se com uma nova conta de **Paciente**
4. Na página inicial, encontre a psicóloga pelo nome ou especialidade
5. Clique no card da psicóloga
6. Escolha a data de hoje no seletor de data
7. Clique em **Reservar** no horário desejado

---

### Etapa 5 — Pagar a consulta (no celular)

Você será redirecionado para a tela de checkout. Duas opções:

**Opção A — Teste rápido (sem Stripe):**
- Clique em **"Simular pagamento (Teste)"** na parte inferior da tela
- A consulta será marcada como paga instantaneamente e a sala de vídeo será criada

**Opção B — Stripe real (modo teste):**
- Clique em **"Pagar R$ X,XX"**
- Use o cartão de teste do Stripe: `4242 4242 4242 4242`, qualquer validade futura, qualquer CVV
- Após o pagamento, você será redirecionado para a página de confirmação

---

### Etapa 6 — Verificar no painel da psicóloga (no computador)

1. No painel da psicóloga, a consulta agendada aparece na seção **"Hoje"** ou **"Próximas sessões"**
2. As estatísticas (Próximas, Realizadas, Pendentes) são atualizadas automaticamente
3. O gráfico de receita reflete o valor pago

---

### Etapa 7 — Entrar na videochamada (5 min antes)

- O botão **"Entrar"** (paciente) ou **"Iniciar"** (psicóloga) aparece automaticamente 5 minutos antes do horário agendado
- Ele abre a sala de vídeo Jitsi (em modo teste) ou Daily.co (produção) em nova aba
- Ambos entram pela mesma sala

---

### Etapa 8 — Avaliar a consulta (no celular, após a sessão)

1. Após o horário da consulta, acesse o dashboard do paciente
2. Na seção **"Histórico"**, a consulta realizada mostrará o botão **"★ Avaliar"**
3. Clique, escolha de 1 a 5 estrelas e escreva seu depoimento (opcional)
4. Clique em **"Enviar avaliação"**
5. A avaliação aparece publicamente no perfil da psicóloga

---

### Resumo visual do fluxo

```
[Psicóloga - PC]           [Paciente - Celular]
     │                            │
     ▼                            │
Configura perfil                  │
Define disponibilidade            │
     │                            ▼
     │                   Acessa http://192.168.x.x:3000
     │                   Cadastra-se como paciente
     │                   Encontra a psicóloga
     │                   Reserva o horário
     │                   Paga (ou simula pagamento)
     │                            │
     ▼                            ▼
Dashboard atualiza         Tela de confirmação
(paciente aparece)         (detalhes da consulta)
     │                            │
     ▼ 5 min antes                ▼ 5 min antes
Botão "Iniciar"            Botão "Entrar"
     │                            │
     └─────── Mesma sala ─────────┘
                  │
                  ▼ Após a sessão
         [Paciente] Botão "★ Avaliar" aparece
                  │
                  ▼
         Avaliação pública no perfil da psicóloga
```

---

## Para a psicóloga — explicação simplificada

> Esta seção é um resumo para profissionais que vão usar a plataforma, sem precisar entender a parte técnica.

---

### O que é esta plataforma?

É um sistema completo para você gerenciar seus atendimentos online. Os pacientes encontram seu perfil, escolhem um horário disponível, pagam e entram direto na videochamada. Tudo em um só lugar.

---

### Como funciona para você (psicóloga)

#### 1. Criar sua conta
- Acesse a plataforma e clique em **"Criar conta"**
- Escolha o papel **"Psicóloga"** no cadastro
- Informe seu CRP — ele será verificado pelo administrador da plataforma

#### 2. Preencher seu perfil
No seu painel, vá em **"Meu Perfil"** e preencha:
- **Foto de perfil** — pacientes clicam muito mais em perfis com foto
- **Biografia** — conte sua abordagem terapêutica e experiência (ex: TCC, psicanálise, terapia breve)
- **Especialidades** — ex: "Ansiedade, Depressão, Relacionamentos, Trauma"
- **Valor por hora** — o sistema calcula automaticamente o valor por sessão com base na duração
- **Duração da sessão** — 30, 45, 50, 60 ou 90 minutos

#### 3. Definir seus horários disponíveis
- Vá em **"Minha agenda"** no menu lateral
- Clique no dia que você quer atender no calendário
- Informe o horário de início e fim (ex: das 8h às 17h)
- O sistema divide automaticamente em sessões do tamanho que você definiu

> Você pode configurar dias diferentes com horários diferentes. Exemplo: segunda das 8h às 12h, quarta das 14h às 18h.

#### 4. Ativar o recebimento de pacientes
- No seu perfil, ative o botão **"Aceitando novos pacientes"**
- Quando estiver de férias ou com agenda cheia, basta desativar — você some da busca automaticamente

#### 5. Acompanhar sua agenda
Seu painel mostra:
- **Sessões de hoje** com o paciente e o horário
- **Próximas sessões** com countdown ao vivo
- **Gráfico de receita** semanal do mês atual
- **Histórico** completo de todos os atendimentos

#### 6. Entrar na consulta
- 5 minutos antes da sessão, um botão **"Iniciar"** aparece automaticamente no seu painel
- Clique nele para abrir a sala de vídeo em nova aba
- O paciente entra pela mesma sala pelo lado dele

#### 7. Ver suas avaliações
- Após cada sessão paga, o paciente pode deixar uma avaliação (nota + comentário)
- As avaliações aparecem publicamente no seu perfil para novos pacientes verem
- A média de estrelas fica visível na listagem principal

---

### Dicas importantes

| Situação | O que fazer |
|---|---|
| Precisa pausar os atendimentos | Desative "Aceitando novos pacientes" no perfil |
| Quer remarcar uma sessão | Cancele o agendamento atual e combine com o paciente para ele reagendar |
| Paciente não apareceu | Cancele a sessão no painel para liberar o horário |
| Quer deixar uma nota particular | Use os **Lembretes** (post-its) no painel — só você vê |

---

### O que o paciente vê

1. Uma lista de psicólogas verificadas com foto, especialidades e preço
2. Ao clicar no seu perfil: sua bio, especialidades, horários disponíveis e avaliações de outros pacientes
3. Um botão para reservar e pagar online
4. Um link de videochamada que aparece automaticamente 5 minutos antes da sessão

---

## Migrações de banco de dados

```bash
# Aplicar todas as migrações pendentes
alembic upgrade head

# Ver histórico
alembic history --verbose

# Criar nova migração (autogerar)
alembic revision --autogenerate -m "descricao da mudanca"

# Reverter a última migração
alembic downgrade -1
```

### Histórico de migrações

| Revisão | Descrição |
|---|---|
| `76da55f5acd5` | Schema inicial — usuários, perfis, agendamentos, tokens |
| `ef1d489cc568` | Adiciona `is_verified` ao perfil de psicóloga |
| `a3f2c1b4d5e6` | Troca `week_day integer` por `specific_date date` em `availabilities` |

---

## Rotas da API

Base URL: `http://localhost:8000/api/v1`

### Autenticação (`/auth`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/auth/register` | — | Cadastro de usuário |
| `POST` | `/auth/token` | — | Login — retorna access + refresh tokens |
| `POST` | `/auth/refresh` | — | Renovar access token |
| `POST` | `/auth/logout` | ✓ | Revogar refresh token |
| `GET` | `/auth/me` | ✓ | Dados do usuário autenticado |
| `PATCH` | `/auth/me` | ✓ | Atualizar nome e telefone |
| `POST` | `/auth/me/password` | ✓ | Trocar senha (verifica senha atual) |
| `POST` | `/auth/me/avatar` | ✓ | Upload de foto de perfil (JPEG/PNG/WebP, máx 5 MB) |
| `DELETE` | `/auth/me/avatar` | ✓ | Remover foto de perfil |

### Psicólogas (`/psychologists`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/psychologists` | — | Listar com filtros (`specialty`, `min_price`, `max_price`) |
| `POST` | `/psychologists/me/profile` | Psicóloga | Criar perfil profissional |
| `PATCH` | `/psychologists/me/profile` | Psicóloga | Editar bio, especialidades, valor/hora |
| `GET` | `/psychologists/me/profile` | Psicóloga | Ver próprio perfil + disponibilidades |
| `PUT` | `/psychologists/me/availability` | Psicóloga | Substituir disponibilidade de um mês |
| `GET` | `/psychologists/me/notes` | Psicóloga | Listar lembretes privados |
| `POST` | `/psychologists/me/notes` | Psicóloga | Criar lembrete |
| `PATCH` | `/psychologists/me/notes/{id}` | Psicóloga | Editar lembrete |
| `DELETE` | `/psychologists/me/notes/{id}` | Psicóloga | Remover lembrete |
| `GET` | `/psychologists/{id}` | — | Detalhes públicos |
| `GET` | `/psychologists/{id}/slots` | — | Slots disponíveis (`?day=YYYY-MM-DD&tz=America/Sao_Paulo`) |
| `GET` | `/psychologists/{id}/reviews` | — | Avaliações públicas com média |
| `PATCH` | `/psychologists/{id}/verify` | Admin | Aprovar ou reprovar CRP |
| `GET` | `/psychologists/admin/pending` | Admin | Psicólogas aguardando verificação |

### Agendamentos (`/appointments`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/appointments` | Paciente | Criar agendamento pendente |
| `GET` | `/appointments/me/patient` | Paciente | Listar agendamentos do paciente |
| `GET` | `/appointments/me/psychologist` | Psicóloga | Listar agenda (com nome do paciente) |
| `GET` | `/appointments/{id}` | Paciente/Psicóloga | Detalhes de um agendamento |
| `DELETE` | `/appointments/{id}` | Paciente/Psicóloga | Cancelar agendamento |
| `GET` | `/appointments/{id}/join` | Autenticado | URL da sala de vídeo (liberada 10 min antes) |
| `POST` | `/appointments/{id}/review` | Paciente | Avaliar consulta realizada (1–5 estrelas) |
| `GET` | `/appointments/{id}/review` | Paciente | Verificar se consulta já foi avaliada |

### Pagamentos (`/payments`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/payments/checkout` | Paciente | Criar sessão Stripe Checkout |
| `POST` | `/payments/mock-pay` | Autenticado | Simular pagamento sem Stripe (desenvolvimento) |
| `POST` | `/payments/webhook` | — | Webhook Stripe (HMAC verificado) |

### Admin (`/admin`)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/admin/stats` | Admin | KPIs da plataforma |

---

## Papéis e permissões

| Papel | Valor | Capacidades |
|---|---|---|
| **Paciente** | `patient` | Buscar psicólogas, agendar, pagar, videochamada, cancelar, avaliar |
| **Psicóloga** | `psychologist` | Criar/editar perfil, disponibilidade, agenda, iniciar consulta, lembretes |
| **Admin** | `admin` | KPIs, aprovar/reprovar CRPs, gerenciar plataforma |

---

## Fluxo completo de agendamento

```
1. Paciente busca psicólogas na home
   GET /psychologists?specialty=ansiedade

2. Escolhe uma psicóloga e seleciona data
   GET /psychologists/{id}/slots?day=2025-06-15&tz=America/Sao_Paulo

3. Confirma o agendamento
   POST /appointments
   { "psychologist_id": "...", "scheduled_at": "2025-06-15T14:00:00Z" }

4. Sistema valida:
   ✓ Psicóloga está aceitando pacientes
   ✓ Slot dentro da janela de disponibilidade (timezone SP)
   ✓ Sem conflito com outro agendamento existente
   → Agendamento criado com status "pending"

5. Paciente vai ao checkout
   POST /payments/checkout  { appointment_id, customer_email }
   → Redireciona para Stripe Checkout
   (ou POST /payments/mock-pay para teste sem Stripe)

6. Após pagamento, Stripe chama o webhook
   POST /payments/webhook
   → Status muda para "paid"
   → Sala de vídeo criada automaticamente

7. 5 minutos antes da sessão
   → Link da sala liberado no dashboard do paciente e da psicóloga

8. Sessão realizada via Daily.co (produção) ou Jitsi (mock-pay)

9. Após a sessão
   POST /appointments/{id}/review  { rating: 5, comment: "Excelente!" }
   → Avaliação aparece publicamente no perfil da psicóloga
```

---

## Detalhes de implementação

### Timezone
Sessões são armazenadas em UTC no banco. A validação de disponibilidade converte o horário agendado para `America/Sao_Paulo` antes de comparar com as janelas configuradas pela psicóloga.

### Tokens JWT
- **Access token**: validade de 30 min, tipo `"access"` no payload
- **Refresh token**: validade de 7 dias, registrado em `refresh_tokens` com suporte a revogação individual

### Transações no banco
O `AsyncSessionLocal` usa `autocommit=False`. Usar apenas `await db.commit()` nos endpoints — nunca `async with db.begin()` dentro do mesmo contexto.

### Proxy do frontend
O `next.config.js` configura rewrites de `/api/v1/*` e `/static/*` para o backend. Não é necessário CORS manual em desenvolvimento, pois os requests saem do servidor Next.js (não do navegador).

### Mock pay vs Stripe
`POST /payments/mock-pay` marca o agendamento como pago e cria uma sala Jitsi Meet (`meet.jit.si/psicologia-{id}`). Ideal para desenvolvimento e demonstrações sem configurar Stripe ou Daily.co.
