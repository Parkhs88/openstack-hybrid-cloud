#!/bin/bash
# =============================================================================
# [파일 위치] /usr/local/bin/check_onprem_status.sh
# [실행 방식] crontab - 매 분마다 5초 간격으로 반복 실행
# [역할] 온프레미스 서비스 상태 체크 → 장애 시 AWS DR 자동 전환
# =============================================================================

DS1_IP="192.168.60.1"        # DS SW1 IP
DS2_IP="192.168.60.2"        # DS SW2 IP (Primary Active)
WIKI_URL="http://192.168.20.20"
DB_IP="192.168.30.30"
DB_PORT="5432"
AWS_WIKI_IP="172.31.32.43"    # AWS EC2 Wiki.js IP
SERVICE_DOMAIN="service.local"
FAIL_THRESHOLD=3
SSH_KEY="/home/admin/.ssh/service_key"
WIKI_SERVER="admin@192.168.20.20"
DB_SERVER="admin@192.168.30.30"

STATE_FILE="/tmp/dr_state"
FAIL_FILE="/tmp/dr_fail_count"
LOG_FILE="/var/log/dr_check.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
CURRENT_STATE=$(cat "$STATE_FILE" 2>/dev/null || echo "onprem")
FAIL_COUNT=$(cat "$FAIL_FILE" 2>/dev/null || echo 0)

log() {
    echo "[$TIMESTAMP] $1" >> "$LOG_FILE"
}

CHECK_FAIL=0

# DS SW1, DS SW2 둘 다 실패해야 네트워크 장애로 판단
SW1_OK=0
SW2_OK=0
ping -c 1 -W 2 "$DS1_IP" > /dev/null 2>&1 && SW1_OK=1
ping -c 1 -W 2 "$DS2_IP" > /dev/null 2>&1 && SW2_OK=1

if [ "$SW1_OK" -eq 0 ] && [ "$SW2_OK" -eq 0 ]; then
    CHECK_FAIL=$((CHECK_FAIL+1))
    log "WARN  DS SW1, SW2 ping 모두 실패 (네트워크 장애 의심)"
fi

# Wiki.js HTTP 체크
curl -fs --max-time 5 "$WIKI_URL" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    CHECK_FAIL=$((CHECK_FAIL+1))
    log "WARN  Wiki.js HTTP 실패 ($WIKI_URL)"
    if [ "$CURRENT_STATE" = "onprem" ]; then
        log "INFO  Wiki.js Docker 재시작 시도"
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$WIKI_SERVER" "sudo docker restart wikijs" 2>/dev/null
        sleep 10
        curl -fs --max-time 5 "$WIKI_URL" > /dev/null 2>&1 && {
            log "INFO  Wiki.js 재시작 성공"
            CHECK_FAIL=$((CHECK_FAIL-1))
        }
    fi
fi

# PostgreSQL TCP 체크
nc -z -w 5 "$DB_IP" "$DB_PORT" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    CHECK_FAIL=$((CHECK_FAIL+1))
    log "WARN  PostgreSQL TCP 실패 ($DB_IP:$DB_PORT)"
    if [ "$CURRENT_STATE" = "onprem" ]; then
        log "INFO  PostgreSQL 재시작 시도"
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$DB_SERVER" "sudo systemctl restart postgresql" 2>/dev/null
        sleep 10
        nc -z -w 5 "$DB_IP" "$DB_PORT" > /dev/null 2>&1 && {
            log "INFO  PostgreSQL 재시작 성공"
            CHECK_FAIL=$((CHECK_FAIL-1))
        }
    fi
fi

# 장애 판단 및 DR 전환
if [ "$CHECK_FAIL" -ge 1 ]; then
    FAIL_COUNT=$((FAIL_COUNT+1))
    echo "$FAIL_COUNT" > "$FAIL_FILE"
    log "WARN  연속 실패 $FAIL_COUNT / $FAIL_THRESHOLD"

    if [ "$FAIL_COUNT" -ge "$FAIL_THRESHOLD" ] && [ "$CURRENT_STATE" = "onprem" ]; then
        log "CRITICAL  장애 확정 → AWS DR 전환"
        /usr/local/bin/change_dns_to_aws.sh
        echo "aws" > "$STATE_FILE"
        echo "0" > "$FAIL_FILE"
    fi

else
    echo "0" > "$FAIL_FILE"
    if [ "$CURRENT_STATE" = "aws" ]; then
        log "INFO  온프레미스 복구 감지 → 원복"
        /usr/local/bin/change_dns_to_onprem.sh
        echo "onprem" > "$STATE_FILE"
    else
        log "INFO  온프레미스 정상 운영 중"
    fi
fi
