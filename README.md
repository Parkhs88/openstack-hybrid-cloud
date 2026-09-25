# DR 캡디 프로젝트 

## 파일 구조 및 실제 배포 경로

---

dr_capstone/
│
├── scripts/                          → VLAN56 모니터링 VM에 배포
│   ├── check_onprem_status.sh        → /usr/local/bin/check_onprem_status.sh
│   ├── change_dns_to_aws.sh          → /usr/local/bin/change_dns_to_aws.sh
│   └── change_dns_to_onprem.sh       → /usr/local/bin/change_dns_to_onprem.sh
│
├── monitoring/                       → VLAN56 모니터링 VM ~/monitoring/
│   ├── docker-compose.yml            → ~/monitoring/docker-compose.yml
│   └── prometheus.yml                → ~/monitoring/prometheus.yml
│
├── log-api/                          → VLAN56 모니터링 VM ~/log-api/
│   └── server.js                     → ~/log-api/server.js
│
├── config/
│   └── dnsmasq/
│       └── internal.conf             → /etc/dnsmasq.d/internal.conf
│
├── network-configs/                  → 네트워크 장비 설정
│   ├── README.md
│   ├── ds-sw1.cfg
│   ├── ds-sw2.cfg
│   ├── bb-sw1.cfg
│   └── bb-sw2.cfg
│
├── docs/                             → 프로젝트 문서 및 결과 이미지
│   ├── architecture.png              → 전체 아키텍처
│   ├── dashboard.png                 → 모니터링 대시보드 결과
│   └── setup.md                      → 상세 구축 및 설정 과정
│
└── react-ui/                         → VLAN56 모니터링 VM ~/dr-monitoring/
    ├── index.html                    → ~/dr-monitoring/index.html
    ├── vite.config.js                → ~/dr-monitoring/vite.config.js
    ├── package.json                  → ~/dr-monitoring/package.json
    └── src/
        ├── main.jsx                  → ~/dr-monitoring/src/main.jsx
        ├── App.jsx                   → ~/dr-monitoring/src/App.jsx
        └── App.css                   → ~/dr-monitoring/src/App.css
---

## Network Configuration

### HSRP

- VLAN 10 : DS SW2 Active
- VLAN 20/30 : DS SW6 Active
- Virtual Gateway : 각 VLAN `.254`
- 게이트웨이 이중화를 통해 Active 장비 장애 시 Standby 장비로 전환

### OSPF / ECMP

- 백본–Distribution 구간 OSPF 기반 동적 라우팅 구성
- 동일 Cost 경로를 이용한 ECMP 구성
- 네트워크 경로 장애 발생 시 OSPF 재계산을 통한 우회 경로 전환 확인

### RSTP

- Rapid-PVST 기반 L2 이중화 구성
- VLAN 10 : DS SW2 Root
- VLAN 20/30 : DS SW6 Root
- 이중화 링크에서 발생할 수 있는 L2 Loop 방지

### VLAN / Trunk

- VLAN 10 : User Network
- VLAN 20 : Web Network
- VLAN 30 : DB Network
- VLAN 56 : Monitoring Network
- Trunk 구간을 통해 장비 간 VLAN 트래픽 전달

### ACL

- 사용자망(VLAN 10)에서 DB 서버로의 직접 접근 차단
- 사용자망에서 Web 서비스 HTTP/HTTPS 접근 허용
- 사용자·Web·DB 네트워크 간 접근 범위 분리

### Device Configuration

네트워크 장비의 세부 설정은 `network-configs/`에서 확인할 수 있습니다.

> 장비 설정 파일은 프로젝트 당시 구성한 네트워크를 기반으로 정리한 설정입니다.

- [DS SW1 Configuration](./network-configs/ds-sw1.cfg)
- [DS SW2 Configuration](./network-configs/ds-sw2.cfg)
- [BB SW1 Configuration](./network-configs/bb-sw1.cfg)
- [BB SW2 Configuration](./network-configs/bb-sw2.cfg)

---

## 환경 정보

| 항목 | 값 |
|---|---|
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
sudo cp scripts/check_onprem_status.sh /usr/local/bin/
sudo cp scripts/change_dns_to_aws.sh /usr/local/bin/
sudo cp scripts/change_dns_to_onprem.sh /usr/local/bin/

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

### 4. crontab 등록

약 30초 간격으로 온프레미스 상태 확인 스크립트를 실행합니다.

```bash
crontab -e

# 아래 두 줄 추가
* * * * * /usr/local/bin/check_onprem_status.sh
* * * * * sleep 30 && /usr/local/bin/check_onprem_status.sh
```

### 5. Prometheus + Blackbox Exporter 실행

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

```text
상태 확인 스크립트 (약 30초 간격)
  └→ check_onprem_status.sh
       ├→ DS SW1/SW2 ICMP 상태 확인
       ├→ Wiki.js HTTP 상태 확인
       ├→ PostgreSQL TCP 상태 확인
       ├→ 장애 감지 시 change_dns_to_aws.sh 호출
       └→ 복구 감지 시 change_dns_to_onprem.sh 호출


Prometheus (15초 간격)
  └→ Blackbox Exporter
       ├→ Network Device : ICMP
       ├→ Wiki.js        : HTTP
       └→ PostgreSQL     : TCP


Node.js API (Port 3001)
  ├→ GET /logs → 장애 감지 로그 반환
  └→ GET /dns  → 현재 DNS 상태 반환
                  (On-Premise / AWS)


React Dashboard (Port 5173)
  ├→ Prometheus API 폴링
  ├→ Node.js API 폴링
  └→ 네트워크 및 서비스 상태 시각화
```
