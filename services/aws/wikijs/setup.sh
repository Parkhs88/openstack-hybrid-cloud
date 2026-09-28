#!/bin/bash
# Wiki.js AWS EC2 DR 설치 스크립트
# 서버: 172.31.32.43 (AWS EC2)
# OS: Ubuntu 22.04
# 용도: On-Prem 장애 시 DR 전환 대상

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

# ========== Wiki.js - RDS 연결 ==========
# RDS 엔드포인트는 AWS 콘솔에서 확인 후 입력
RDS_ENDPOINT="<RDS_ENDPOINT>.rds.amazonaws.com"

mkdir -p ~/wikijs-dr && cd ~/wikijs-dr

cat > docker-compose.yml <<EOF
version: "3"
services:
  wiki:
    image: ghcr.io/requarks/wiki:2
    container_name: wikijs-dr
    environment:
      DB_TYPE: postgres
      DB_HOST: ${RDS_ENDPOINT}
      DB_PORT: 5432
      DB_NAME: wiki
      DB_USER: wikijs
      DB_PASS: wikijspassword
    ports:
      - "3000:3000"
    restart: unless-stopped
EOF

sudo docker compose up -d

echo "[완료] AWS Wiki.js DR 실행 확인: http://172.31.32.43:3000"
echo "[확인] RDS 엔드포인트: $RDS_ENDPOINT"
