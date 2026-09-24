# Deploy na Oracle Cloud

Tudo roda num `docker compose` só, dentro de uma VM ARM (Ampere) já existente do Always Free:

```
Internet ──443──▶ web (Caddy: HTTPS automático + frontend estático)
                    └── /api/* ──▶ api (FastAPI) ──▶ postgres + redis
```

Só o Caddy publica portas (80 e 443). API, Postgres e Redis ficam na rede
interna do Docker, sem acesso de fora. A stack inteira usa ~250 MB de RAM.

---

## 1. Onde rodar (e como não pagar nada)

**Rode na VM que já existe** (a do Minecraft). Não crie VM A1 nova:

- Desde 15/06/2026 o Always Free do Ampere A1 caiu de 4 OCPU / 24 GB para
  **2 OCPU / 12 GB por tenancy** (1.500 OCPU-horas e 9.000 GB-horas/mês).
  A documentação diz que vale pra todas as contas; o suporte já disse que VMs
  Pay As You Go existentes mantêm o limite antigo, mas que recursos novos acima
  do limite podem não ser permitidos. VM nova = risco de cobrança.
- A DayUP usa ~250 MB de RAM e quase nada de CPU; cabe ao lado do Minecraft.
- De quebra, a VM continua com uso real e não entra na regra de VM ociosa.

Proteção contra cobrança surpresa (conta Pay As You Go):

1. **Billing & Cost Management → Budgets → Create Budget**: valor `1` (USD),
   alerta em *Actual spend* ≥ 1%. Qualquer centavo cobrado vira e-mail.
2. **Billing & Cost Management → Cost Analysis**: confira os últimos meses.
   Se aparecer custo de *Compute – Ampere A1*, reduza a VM pra
   **2 OCPU / 12 GB** (*Instance → Edit → Shape*, exige reiniciar a VM) e
   ajuste o `-Xmx` do Minecraft pra ~9–10 GB.
3. Não crie *reserved public IP*, load balancer nem política de backup de
   volume. O IP efêmero da VM e os dumps do passo 7 bastam.

## 2. Liberar as portas 80 e 443 na Oracle

**Networking → Virtual Cloud Networks → (sua VCN) → Subnet → Security List → Add Ingress Rules**,
uma regra para cada porta:

| Source CIDR | IP Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

A porta 80 é necessária: o Let's Encrypt valida o domínio por ela, e o Caddy
redireciona tudo pra HTTPS. Não mexa nas regras que já existem pro Minecraft.

## 3. Domínio

Produção: **`dayup.biigstudio.com.br`**. O DNS do `biigstudio.com.br` fica no
Registro.br (o site principal aponta pra Vercel e não é afetado):

**registro.br → biigstudio.com.br → DNS → Editar zona → Nova entrada**

| Tipo | Nome | Dados |
|---|---|---|
| `A` | `dayup` | IP público da VM |

Confira antes de seguir: `nslookup dayup.biigstudio.com.br 8.8.8.8` deve
responder com o IP da VM.

## Atalho: passos 4 a 7 num comando só

Com o domínio já apontando pra VM e as portas liberadas na Oracle:

```bash
curl -fsSLO https://raw.githubusercontent.com/joaopedro-ssilva/DayUP/main/deploy/setup-vm.sh
bash setup-vm.sh dayup.biigstudio.com.br
```

O script confere o DNS, instala Docker e git, libera o firewall da VM, clona o
repositório, gera o `.env` com senhas aleatórias, sobe tudo, cria a conta demo e
agenda o backup. Pode rodar de novo para atualizar. Os passos abaixo são o mesmo
processo feito à mão.

## 4. Preparar a VM

```bash
ssh ubuntu@IP_DA_VM   # em Oracle Linux o usuário é "opc" (ajuste os caminhos /home/ubuntu abaixo)

# Docker + compose (pule se `docker compose version` já funcionar)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit   # saia e entre de novo pro grupo docker valer
```

Firewall do próprio sistema (as imagens Ubuntu da Oracle vêm com `iptables` bloqueando tudo):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

> VM com **Oracle Linux** (comum em servidores de Minecraft):
> `sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload`

## 5. Código e segredos

```bash
git clone https://github.com/joaopedro-ssilva/DayUP.git
cd DayUP/deploy
cp .env.example .env
openssl rand -hex 32   # rode 2x: um valor pra POSTGRES_PASSWORD, outro pra SESSION_SECRET
nano .env              # preencha DOMAIN, POSTGRES_PASSWORD e SESSION_SECRET
chmod 600 .env
```

> Repositório privado? Crie uma *deploy key* só leitura: `ssh-keygen -t ed25519`,
> cole o `.pub` em GitHub → Settings → Deploy keys, e clone via `git@github.com:...`.

## 6. Subir

```bash
docker compose up -d --build     # primeira vez leva alguns minutos no ARM
docker compose ps                # os 4 serviços devem estar "running"
docker compose logs -f web       # procure "certificate obtained successfully"
```

Abra `https://dayup.biigstudio.com.br`. As migrações do banco rodam sozinhas a cada subida da API.

**Conta demo** (bom pra quem chegar pelo LinkedIn testar sem cadastro):

```bash
docker compose exec api python -m scripts.seed_demo
# login: demo@dayup.app / demo1234
```

## 7. Backup diário

```bash
crontab -e
# adicione a linha:
0 3 * * * bash /home/ubuntu/DayUP/deploy/backup.sh >> /home/ubuntu/dayup-backup.log 2>&1
```

Os dumps ficam em `deploy/backups/` (últimos 7 dias). Como estão na mesma VM, de vez em quando
copie um pra fora: `scp ubuntu@IP_DA_VM:DayUP/deploy/backups/*.gz .`

Restaurar um dump:

```bash
gunzip -c backups/dayup-AAAA-MM-DD.sql.gz | docker compose exec -T postgres psql -U dayup -d dayup
```

## 8. Atualizar depois de um push

```bash
cd ~/DayUP && git pull && cd deploy && docker compose up -d --build && docker image prune -f
```

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Site não abre / timeout | Porta 80/443 faltando na Security List (passo 2) ou no iptables (passo 4) |
| Erro de certificado | DNS ainda não aponta pro IP, ou porta 80 fechada. Veja `docker compose logs web` |
| `defina DOMAIN no deploy/.env` | `.env` ausente ou incompleto na pasta `deploy/` |
| 502 em `/api/...` | API caiu ou ainda está migrando: `docker compose logs api` |
| Login funciona e desloga ao recarregar | Acessando por `http://` ou pelo IP. Use sempre `https://domínio` |

## Segurança: o que já está coberto

- HTTPS com renovação automática; HTTP redireciona pra HTTPS; HSTS ligado
- Cookies de sessão `HttpOnly` + `Secure` + `SameSite=lax`, com CSRF double-submit
- Postgres e Redis sem porta publicada; API só acessível via Caddy
- Rate limit usa o IP real do usuário (o Caddy descarta `X-Forwarded-For` forjado)
- `/docs` e `/openapi.json` desligados em produção
- Headers de segurança (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`)
- API roda como usuário sem privilégios dentro do container
- Segredos só no `deploy/.env` (fora do git)
