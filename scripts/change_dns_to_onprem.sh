#!/bin/bash
# =============================================================================
# [파일 위치] /usr/local/bin/change_dns_to_onprem.sh
# [역할] dnsmasq DNS를 온프레미스 IP로 복구 (서비스 정상화 시 호출)
# =============================================================================

SERVICE_DOMAIN="service.local"
ONPREM_WIKI_IP="192.168.20.20"     # 온프레미스 Wiki.js IP
DNSMASQ_CONF="/etc/dnsmasq.d/internal.conf"
LOG_FILE="/var/log/dr_check.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "address=/$SERVICE_DOMAIN/$ONPREM_WIKI_IP" | sudo tee "$DNSMASQ_CONF" > /dev/null
sudo systemctl restart dnsmasq

echo "[$TIMESTAMP] RECOVERY  DNS 복구 완료: $SERVICE_DOMAIN → $ONPREM_WIKI_IP" >> "$LOG_FILE"
