#!/usr/bin/env bash
# Prepara a VM e sobe a DayUP de ponta a ponta. Pode rodar de novo sem problema
# (atualiza o código e reaproveita o .env existente).
#
# Uso, na VM (baixar e depois rodar — não use "curl | bash", comandos internos
# que leem stdin engoliriam o resto do script):
#   curl -fsSLO https://raw.githubusercontent.com/bigjujas/DayUP/main/deploy/setup-vm.sh
#   bash setup-vm.sh dayup.biigstudio.com.br
set -euo pipefail

DOMAIN="${1:?uso: bash setup-vm.sh dayup.biigstudio.com.br}"
REPO_URL="https://github.com/bigjujas/DayUP.git"
APP_DIR="$HOME/DayUP"

. /etc/os-release
step() { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }

step "Conferindo DNS de $DOMAIN"
VM_IP="$(curl -4 -fsS https://ifconfig.me)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}')"
if [ "$VM_IP" != "$DNS_IP" ]; then
  echo "O domínio aponta pra '${DNS_IP:-nada}', mas o IP desta VM é $VM_IP."
  echo "Atualize o IP na DuckDNS e rode de novo (o HTTPS depende disso)."
  exit 1
fi
echo "ok: $DOMAIN → $VM_IP"

step "Instalando Docker e git (se faltar)"
if ! command -v docker >/dev/null; then
  if [ "$ID" = "ol" ]; then
    # Oracle Linux não é suportado pelo get.docker.com; usa o repositório do CentOS.
    sudo dnf install -y dnf-plugins-core
    sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo systemctl enable --now docker
  else
    curl -fsSL https://get.docker.com | sudo sh
  fi
fi
if [ "$ID" = "ol" ]; then
  command -v git >/dev/null || sudo dnf install -y git
  command -v crontab >/dev/null || { sudo dnf install -y cronie && sudo systemctl enable --now crond; }
else
  command -v git >/dev/null || sudo apt-get install -y git
fi
sudo usermod -aG docker "$USER"

step "Liberando as portas 80 e 443 no firewall da VM"
if command -v firewall-cmd >/dev/null && sudo firewall-cmd --state >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-service=http --add-service=https
  sudo firewall-cmd --reload
else
  for port in 80 443; do
    if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
      # Insere antes do REJECT padrão das imagens da Oracle (ou no topo, se não houver).
      reject_line="$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')"
      sudo iptables -I INPUT "${reject_line:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  done
  if command -v netfilter-persistent >/dev/null; then
    sudo netfilter-persistent save
  fi
fi

step "Baixando o código"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi

step "Segredos (deploy/.env)"
ENV_FILE="$APP_DIR/deploy/.env"
if [ -f "$ENV_FILE" ]; then
  # Nunca sobrescreve: trocar a senha do Postgres depois do primeiro boot quebra o banco.
  echo "já existe, mantendo"
else
  (umask 077 && cat > "$ENV_FILE" <<EOF
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
EOF
  )
  echo "criado com senhas aleatórias"
fi

step "Subindo os containers (primeira vez leva alguns minutos)"
cd "$APP_DIR/deploy"
sudo docker compose up -d --build

step "Esperando a API migrar o banco"
for _ in $(seq 1 60); do
  if sudo docker compose exec -T api python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

step "Conta demo"
sudo docker compose exec -T api python -m scripts.seed_demo | tail -2

step "Backup diário às 3h"
CRON_LINE="0 3 * * * bash $APP_DIR/deploy/backup.sh >> $HOME/dayup-backup.log 2>&1"
(crontab -l 2>/dev/null | grep -Fv "deploy/backup.sh" || true; echo "$CRON_LINE") | crontab -
echo "ok"

step "Pronto"
echo "https://$DOMAIN  (o certificado pode levar ~1 min na primeira vez)"
echo "Conta demo: demo@dayup.app / demo1234"
echo "Logs: cd $APP_DIR/deploy && sudo docker compose logs -f"
