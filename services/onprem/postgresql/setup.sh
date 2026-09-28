#!/bin/bash
# PostgreSQL 온프레미스 설치 스크립트
# 서버: 192.168.30.30 (VLAN30)
# OS: Ubuntu 22.04

# ========== PostgreSQL 설치 ==========
sudo apt update
sudo apt install -y postgresql postgresql-contrib

sudo systemctl enable postgresql
sudo systemctl start postgresql

# ========== DB 및 사용자 생성 ==========
sudo -u postgres psql <<EOF
-- Wiki.js용 DB 생성
CREATE DATABASE wiki;
CREATE USER wikijs WITH ENCRYPTED PASSWORD 'wikijspassword';
GRANT ALL PRIVILEGES ON DATABASE wiki TO wikijs;

-- DR 복제용 사용자 (AWS RDS 동기화 시 사용)
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicatorpassword';
EOF

# ========== 외부 접속 허용 설정 ==========
PG_VERSION=$(psql --version | awk '{print $3}' | cut -d. -f1)
PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"

# 모든 IP에서 접속 허용
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"

# VLAN20 (Wiki.js) 접속 허용
echo "host wiki wikijs 192.168.20.0/24 md5" | sudo tee -a "$PG_HBA"

# 모니터링 서버 접속 허용
echo "host all all 192.168.99.0/24 md5" | sudo tee -a "$PG_HBA"

sudo systemctl restart postgresql

echo "[완료] PostgreSQL 실행 확인: 192.168.30.30:5432"
