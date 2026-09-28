#!/bin/bash
# AWS RDS PostgreSQL DR 설정 가이드
# 용도: On-Prem PostgreSQL 장애 시 DR 전환 대상
# 연결: Wiki.js EC2 (172.31.32.43) → RDS

# ========== AWS 콘솔에서 RDS 생성 순서 ==========
# 1. AWS 콘솔 → RDS → 데이터베이스 생성
# 2. 엔진: PostgreSQL 15
# 3. 템플릿: 프리 티어
# 4. DB 인스턴스 식별자: wikijs-dr-db
# 5. 마스터 사용자: wikijs
# 6. 마스터 암호: wikijspassword
# 7. VPC: Wiki.js EC2와 동일한 VPC
# 8. 퍼블릭 액세스: 아니요
# 9. 보안 그룹: EC2에서 5432 포트 허용

# ========== RDS 생성 후 DB 초기화 ==========
# RDS 엔드포인트 확인 후 아래 실행
RDS_ENDPOINT="<RDS_ENDPOINT>.rds.amazonaws.com"

# EC2에서 psql로 접속
sudo apt install -y postgresql-client

psql -h "$RDS_ENDPOINT" -U wikijs -d postgres <<EOF
CREATE DATABASE wiki;
GRANT ALL PRIVILEGES ON DATABASE wiki TO wikijs;
EOF

echo "[완료] RDS 접속 확인: $RDS_ENDPOINT:5432"

# ========== 보안 그룹 설정 (AWS 콘솔) ==========
# RDS 보안 그룹 인바운드 규칙:
# - 유형: PostgreSQL (5432)
# - 소스: EC2 보안 그룹 ID or 172.31.0.0/16
# - 설명: Wiki.js EC2 접속 허용

# WireGuard 터널 통해 온프레미스 접속 허용:
# - 유형: PostgreSQL (5432)
# - 소스: 10.0.0.0/24 (WireGuard 터널 대역)
# - 설명: On-Prem 모니터링 접속 허용
