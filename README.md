# Day UP

Plataforma web mobile-first para acompanhamento de rotinas diárias, com estética "match history" inspirada em OP.GG / DeepLoL — cada dia vira uma "partida" com score, tier e histórico denso.

O nome é literal: sua rotina, um dia por vez, subindo de nível.

---

## Como o Day UP funciona (visão de produto)

O loop principal é curto:

1. **Metas recorrentes** — o usuário monta uma biblioteca de metas por categoria (Saúde, Estudo, Bem-estar, Alimentação, Sono), com **peso** (baixa/média/alta = 1/2/3) e **quais dias da semana** cada uma está ativa. Ex: "Treino" toda seg/qua/sex, peso 3.
2. **Check-in diário** — a tela **Hoje** lista só as metas do dia. Pra cada uma, o usuário marca o nível de esforço em quatro degraus: ❌ 0 · 🟡 40% · 🟠 70% · 🟢 100%. Pode também registrar **mood** (emoji do dia), **nota** livre e **horário** em que cumpriu cada meta.
3. **Score do dia** — calculado em tempo real:
   ```
   Score = round( (Σ peso × nível) / (Σ pesos) × 100 )
   ```
   Resultado 0 a 100, mapeado em **tiers**: Perfeito (100) · Excelente (85+) · Bom (65+) · Regular (45+) · Difícil (<45).
4. **Histórico** — a Home mostra os últimos 14 dias como cards com cor por tier (accent bar lateral), score em destaque e ícones das metas cumpridas. Estilo match-history: denso, escaneável, viciante.
5. **Métricas de topo** — 4 KPIs:
   - **Streak** — dias consecutivos sem quebrar (Day Off mantém, missed quebra)
   - **Consistência** — % de dias registrados desde a criação da conta
   - **Score médio** — média geral
   - **Score últimos 14 dias** — com delta vs. os 14 anteriores

### Estados do dia

| Estado | Score | Consistência | Streak |
|---|---|---|---|
| ✅ Registrado | Afeta | Positivo | Mantém |
| 🏖️ Day Off | Não afeta | Neutro | Mantém |
| ⚠️ Não registrado (>48h) | Não afeta | Negativo | Quebra |

**Day Off** pode ser declarado a qualquer momento — é o mecanismo pra descanso sem penalidade.

**Janela de check-in**: 48h após o dia. Passou disso, o dia vira "missed" e não pode ser mais registrado (mas continua no histórico).

---

## Stack técnica

### Backend
- **FastAPI** (Python 3.11+) — API REST com OpenAPI/docs auto-gerado
- **SQLAlchemy 2.0** + **Alembic** — ORM tipado e migrações versionadas
- **PostgreSQL 16** — banco de dados principal
- **Redis 7** — sessões server-side, rate limiting, cache (Celery futuramente)
- **Pydantic v2** — validação de request/response
- **argon2-cffi** — hash de senha (mais moderno que bcrypt)
- **itsdangerous** — assinatura de tokens auxiliares
- **email-validator** — validação forte de e-mail

### Frontend
- **React 18** + **TypeScript** + **Vite** — build rápido e HMR
- **TanStack Query v5** — todo o estado de servidor (fetch/cache/invalidation)
- **React Router 6** — roteamento com rotas protegidas
- **Tailwind CSS** — utility classes + tokens custom do design (paleta warm-amber)
- **Fontes**: Oswald (display), Inter (body), JetBrains Mono (números)
- **Lucide Icons** — SVG icons (sem emoji como ícone estrutural)

### Autenticação
- Session cookies **HttpOnly** com **CSRF double-submit token** — sem JWT em localStorage
- Rate limiting por IP + e-mail via Redis
- Validação de senha: mín. 8 chars com letras + números

### Infra local
- **Docker Compose** sobe Postgres + Redis com dados persistentes em volumes

---

## Estrutura de pastas

```
DayUP/
├── backend/
│   ├── app/
│   │   ├── routes/          # endpoints por domínio (auth, goals, day_logs)
│   │   ├── services/        # lógica pura (scoring, stats)
│   │   ├── models.py        # tabelas SQLAlchemy
│   │   ├── schemas.py       # Pydantic request/response
│   │   ├── security.py      # sessão, hash, CSRF
│   │   ├── config.py        # settings via .env
│   │   └── main.py          # app FastAPI
│   ├── alembic/versions/    # migrações
│   ├── scripts/
│   │   └── seed_demo.py     # cria conta de demonstração
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── pages/           # telas (Home, CheckIn, Goals, Profile, Login…)
│   │   ├── components/      # UI reutilizável (AppShell, DayRow, day/…)
│   │   ├── hooks/           # ex: useDayEditor
│   │   ├── lib/             # api, queries, tipos, format helpers
│   │   └── index.css        # tokens + utilitários custom
│   ├── tailwind.config.ts
│   └── vite.config.ts
├── docker-compose.yml       # Postgres + Redis pra desenvolvimento
└── CLAUDE.md                # briefing detalhado do produto
```

---

## Modelo de dados (resumo)

```
User
  id, email, name, password_hash, created_at

Goal (meta recorrente)
  id, user_id, name, category, weight (1|2|3), days_of_week[0..6], archived_at

DayLog (registro de um dia)
  id, user_id, date, status (registered|day_off|missed), score (0-100),
  mood (nullable), note (nullable), finalized (bool)

GoalEntry (avaliação de uma meta dentro de um dia)
  id, day_log_id, goal_id, weight (snapshot), level (0.0|0.4|0.7|1.0), done_at (nullable)
```

**Convenções**:
- `days_of_week`: array `[0..6]` onde `0=segunda`, `6=domingo`
- `weight` na `GoalEntry` é **snapshot** — se a meta muda de peso, o histórico não recalcula
- Streak considera absence como quebra (após o dia atual)

---

## Pré-requisitos

- Docker Desktop
- Python 3.11+
- Node 20+ e npm

---

## Rodando localmente

### 1. Banco de dados e Redis

```powershell
docker compose up -d
```

Sobe Postgres 16 e Redis 7 com volumes persistentes.

### 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # Windows PowerShell
# source .venv/bin/activate      # macOS/Linux
pip install -e ".[dev]"
copy .env.example .env           # Windows
# cp .env.example .env           # macOS/Linux
alembic upgrade head
uvicorn app.main:app --reload
```

API em `http://localhost:8000` — docs em `http://localhost:8000/docs`.

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

App em `http://localhost:5173`. Vite faz proxy `/api/*` → `localhost:8000`.

### 4. Conta demo (opcional)

Popula uma conta pronta com 7 metas + 30 dias de histórico variado (útil pra apresentar sem precisar registrar nada):

```powershell
cd backend
.\.venv\Scripts\python.exe -m scripts.seed_demo
```

Login:
- **Email**: `demo@dayup.app`
- **Senha**: `demo1234`

O script é **idempotente**: rodar de novo apaga e recria os dados.

---

## Deploy

No ar em **https://dayup.biigstudio.com.br**.

Produção roda numa VM Always Free da Oracle com `docker compose`: Caddy (HTTPS automático + frontend) → FastAPI → Postgres + Redis, com só as portas 80/443 expostas.

Passo a passo completo em [deploy/README.md](deploy/README.md).

---

## Comandos úteis

```powershell
# Ver logs do Postgres/Redis
docker compose logs -f

# Migrar após mudar models.py
cd backend
alembic revision --autogenerate -m "descrição"
alembic upgrade head

# Type-check do frontend
cd frontend
npx tsc --noEmit

# Build de produção do frontend
npm run build

# Inspecionar o banco
docker exec -it dayup-postgres psql -U dayup -d dayup
```

---

## Princípios de desenvolvimento

- Segurança no backend — nunca confiar em dados do cliente
- Mobile-first sempre — começar pelo mobile e escalar
- Anti-overengineering — abstração só quando repetir 3× ou mais
- Nomes descritivos, sem abreviações obscuras
- TanStack Query como fonte única de verdade pra estado de servidor (sem useState duplicado)
- Tokens de cor via Tailwind — nunca hex solto no componente
