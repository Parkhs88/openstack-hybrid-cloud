# DR 캡디 프로젝트 

## 파일 구조 및 실제 배포 경로

```
dr_capstone/
│
├── scripts/                          → VLAN56 모니터링 VM에 배포
│   ├── check_onprem_status.sh        → /usr/local/bin/check_onprem_status.sh
│   ├── change_dns_to_aws.sh          → /usr/local/bin/change_dns_to_aws.sh
│   └── change_dns_to_onprem.sh       → /usr/local/bin/change_dns_to_onprem.sh
│
├── monitoring/                       → VLAN56 모니터링 VM  ~/monitoring/
│   ├── docker-compose.yml            → ~/monitoring/docker-compose.yml
│   └── prometheus.yml                → ~/monitoring/prometheus.yml
│
├── log-api/                          → VLAN56 모니터링 VM  ~/log-api/
│   └── server.js                     → ~/log-api/server.js
│
├── config/
│   └── dnsmasq/
│       └── internal.conf             → /etc/dnsmasq.d/internal.conf
│
└── react-ui/                         → VLAN56 모니터링 VM  ~/dr-monitoring/
    ├── index.html                    → ~/dr-monitoring/index.html
    ├── vite.config.js                → ~/dr-monitoring/vite.config.js
    ├── package.json                  → ~/dr-monitoring/package.json
    └── src/
        ├── main.jsx                  → ~/dr-monitoring/src/main.jsx
        ├── App.jsx                   → ~/dr-monitoring/src/App.jsx
        └── App.css                   → ~/dr-monitoring/src/App.css
```

---

## 환경 정보

| 항목 | 값 |
|------|----|
| 모니터링 VM | 192.168.56.10 (VLAN56) |
| 서비스 서버 | 192.168.20.20 (VLAN20) |
| DB 서버 | 192.168.30.30 (VLAN30) |
| DS SW1 | 192.168.60.1 |
| DS SW2 | 192.168.60.2 (Primary Active) |
| AWS Wiki.js | 172.31.32.43 |
| 내부 도메인 | service.local |
| SSH 키 경로 | /home/admin/.ssh/service_key |

---

## 설치 순서 (VLAN56 VM 기준)

### 1. 스크립트 배포
```bash
sudo cp scripts/check_onprem_status.sh   /usr/local/bin/
sudo cp scripts/change_dns_to_aws.sh     /usr/local/bin/
sudo cp scripts/change_dns_to_onprem.sh  /usr/local/bin/
sudo chmod +x /usr/local/bin/check_onprem_status.sh
sudo chmod +x /usr/local/bin/change_dns_to_aws.sh
sudo chmod +x /usr/local/bin/change_dns_to_onprem.sh
```

### 2. dnsmasq 설정
```bash
sudo apt install -y dnsmasq
sudo cp config/dnsmasq/internal.conf /etc/dnsmasq.d/
# /etc/dnsmasq.conf 에 아래 추가
# server=8.8.8.8
sudo systemctl restart dnsmasq
```

### 3. 로그 파일 권한 설정
```bash
sudo touch /var/log/dr_check.log
sudo chmod 666 /var/log/dr_check.log
```

### 4. crontab 등록 (5초 간격 실행)
```bash
crontab -e
# 아래 두 줄 추가
* * * * * /usr/local/bin/check_onprem_status.sh
* * * * * sleep 30 && /usr/local/bin/check_onprem_status.sh
```

### 5. Prometheus + Blackbox 실행
```bash
mkdir -p ~/monitoring
cp monitoring/docker-compose.yml ~/monitoring/
cp monitoring/prometheus.yml ~/monitoring/
cd ~/monitoring
docker compose up -d
```

### 6. Node.js 로그 API 실행
```bash
mkdir -p ~/log-api
cp log-api/server.js ~/log-api/
cd ~/log-api
nohup node server.js &
```

### 7. React 대시보드 실행
```bash
mkdir -p ~/dr-monitoring
cp -r react-ui/* ~/dr-monitoring/
cd ~/dr-monitoring
npm install
npm run dev
```

---

## 동작 흐름

```
crontab (5초마다)
  └→ check_onprem_status.sh
       ├→ DS SW1/SW2 ping 체크
       ├→ Wiki.js HTTP 체크
       ├→ PostgreSQL TCP 체크
       ├→ 장애 감지 시: change_dns_to_aws.sh 호출
       └→ 복구 감지 시: change_dns_to_onprem.sh 호출

Prometheus (15초마다)
  └→ Blackbox Exporter 통해 각 서비스 상태 수집

Node.js API (port 3001)
  ├→ GET /logs  → dr_check.log 반환
  └→ GET /dns   → 현재 DNS 상태 반환 (온프레미스/AWS)

React 대시보드 (port 5173)
  ├→ Prometheus API 폴링 (5초)
  └→ Node.js API 폴링 (5초)
```
