#!/bin/bash
# WireGuard VPN 설정 - 온프레미스 방화벽
# 역할: On-Prem ↔ AWS EC2 터널 구성
# OS: Ubuntu 22.04 (방화벽 VM)

# ========== 1. WireGuard 설치 ==========
sudo apt update
sudo apt install -y wireguard

# ========== 2. 키 생성 ==========
wg genkey | sudo tee /etc/wireguard/privatekey | \
  wg pubkey | sudo tee /etc/wireguard/publickey

echo "[온프레미스 공개키 - AWS에 등록 필요]"
cat /etc/wireguard/publickey

# ========== 3. wg0 인터페이스 설정 ==========
sudo cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.200.0.1/24
ListenPort = 51820
PrivateKey = $(cat /etc/wireguard/privatekey)

# IP 포워딩
PostUp = sysctl -w net.ipv4.ip_forward=1
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# ========== AWS EC2 Wiki.js Peer ==========
[Peer]
PublicKey = <AWS_EC2_PUBLIC_KEY>
Endpoint = <AWS_EC2_PUBLIC_IP>:51820
AllowedIPs = 10.200.0.2/32, 172.31.32.0/24
PersistentKeepalive = 25
EOF

# ========== 4. WireGuard 시작 ==========
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0

# ========== 5. 연결 확인 ==========
sudo wg show
echo "[확인] AWS EC2로 ping 테스트"
ping -c 3 10.200.0.2
