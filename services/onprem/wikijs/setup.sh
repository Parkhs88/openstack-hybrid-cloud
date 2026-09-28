#!/bin/bash
# Wiki.js 온프레미스 설치 스크립트
# 서버: 192.168.20.20 (VLAN20)
# OS: Ubuntu 22.04

# ========== Docker 설치 ==========
sudo apt update
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable docker
sudo systemctl start docker

# ========== Wiki.js + PostgreSQL docker-compose ==========
mkdir -p ~/wikijs && cd ~/wikijs

cat > docker-compose.yml <<EOF
version: "3"
services:
  db:
    image: postgres:15
    container_name: wikijs-db
    environment:
      POSTGRES_DB: wiki
      POSTGRES_USER: wikijs
      POSTGRES_PASSWORD: wikijspassword
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  wiki:
    image: ghcr.io/requarks/wiki:2
    container_name: wikijs
    depends_on:
      - db
    environment:
      DB_TYPE: postgres
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: wiki
      DB_USER: wikijs
      DB_PASS: wikijspassword
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  pgdata:
EOF

# Wiki.js 실행
sudo docker compose up -d

echo "[완료] Wiki.js 실행 확인: http://192.168.20.20:3000"
