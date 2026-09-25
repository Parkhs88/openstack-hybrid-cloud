#!/bin/bash
# =============================================================================
# [파일 위치] /usr/local/bin/change_dns_to_aws.sh
# [역할] dnsmasq DNS를 AWS EC2 IP로 전환 (장애 발생 시 호출)
# =============================================================================

SERVICE_DOMAIN="service.local"
AWS_WIKI_IP="172.31.32.43"         # AWS EC2 Wiki.js 사설 IP
DNSMASQ_CONF="/etc/dnsmasq.d/internal.conf"
LOG_FILE="/var/log/dr_check.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "address=/$SERVICE_DOMAIN/$AWS_WIKI_IP" | sudo tee "$DNSMASQ_CONF" > /dev/null
sudo systemctl restart dnsmasq

echo "[$TIMESTAMP] DR    DNS 전환 완료: $SERVICE_DOMAIN → $AWS_WIKI_IP" >> "$LOG_FILE"
