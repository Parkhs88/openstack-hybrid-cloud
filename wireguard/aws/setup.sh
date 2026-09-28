#!/bin/bash
# WireGuard VPN 설정 - AWS EC2
# 역할: AWS EC2 ↔ On-Prem 방화벽 터널
# OS: Ubuntu 22.04 (AWS EC2)
# EC2 IP: 172.31.32.43

# ========== 1. WireGuard 설치 ==========
sudo apt update
sudo apt install -y wireguard

# ========== 2. 키 생성 ==========
wg genkey | sudo tee /etc/wireguard/privatekey | \
  wg pubkey | sudo tee /etc/wireguard/publickey

echo "[AWS EC2 공개키 - 온프레미스에 등록 필요]"
cat /etc/wireguard/publickey

# ========== 3. wg0 인터페이스 설정 ==========
sudo cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.200.0.2/24
ListenPort = 51820
PrivateKey = $(cat /etc/wireguard/privatekey)

PostUp = sysctl -w net.ipv4.ip_forward=1
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT

# ========== 온프레미스 방화벽 Peer ==========
[Peer]
PublicKey = <ONPREM_FIREWALL_PUBLIC_KEY>
Endpoint = <ONPREM_NAT_PUBLIC_IP>:51820
AllowedIPs = 10.200.0.1/32, 192.168.0.0/16
PersistentKeepalive = 25
EOF

# ========== 4. AWS 보안 그룹 설정 (콘솔) ==========
# 인바운드 규칙 추가:
# - 유형: 사용자 지정 UDP
# - 포트: 51820
# - 소스: <ONPREM_NAT_PUBLIC_IP>/32
# - 설명: WireGuard VPN

# ========== 5. WireGuard 시작 ==========
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0

# ========== 6. 연결 확인 ==========
sudo wg show
echo "[확인] 온프레미스로 ping 테스트"
ping -c 3 10.200.0.1
echo "[확인] 온프레미스 Wiki.js 접근 테스트"
curl -s -o /dev/null -w "%{http_code}" http://192.168.20.20:3000
