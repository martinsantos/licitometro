#!/bin/bash
# ==========================================================================
# Diagnóstico Integral - Licitometro
# Ejecutar en VPS: bash scripts/diagnostico_integral.sh
# Ejecutar remoto:  ssh root@76.13.234.213 "bash /opt/licitometro/scripts/diagnostico_integral.sh"
# ==========================================================================

BACKEND="licitometro-backend-1"
NGINX="licitometro-nginx-1"
MONGO="licitometro-mongodb-1"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }
section() { echo -e "\n${CYAN}════ $1 ════${NC}"; }

section "1. CONTAINERS"
for c in $BACKEND $NGINX $MONGO; do
    status=$(docker inspect --format='{{.State.Status}}' $c 2>/dev/null)
    health=$(docker inspect --format='{{.State.Health.Status}}' $c 2>/dev/null)
    if [ "$status" = "running" ]; then
        if [ "$health" = "healthy" ] || [ "$health" = "" ]; then
            ok "$c: running (health=$health)"
        else
            warn "$c: running but health=$health"
        fi
    else
        fail "$c: status=$status"
    fi
done

section "2. DNS RESOLUTION"
for domain in licitometro.ar www.licitometro.ar; do
    ip=$(dig +short $domain 2>/dev/null | head -1)
    if [ -n "$ip" ]; then
        ok "$domain → $ip"
    else
        fail "$domain → NO RESOLUTION"
        warn "  Fix: Add DNS record in Cloudflare (A or CNAME) for $domain"
    fi
done

section "3. HTTP ENDPOINTS"
for url in \
    "http://localhost/api/health" \
    "http://localhost/api/" \
    "https://licitometro.ar/api/health" \
    "https://www.licitometro.ar/api/health"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
    if [ "$code" = "200" ]; then
        ok "GET $url → $code"
    elif [ "$code" = "301" ] || [ "$code" = "302" ]; then
        redirect=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 10 "$url" 2>/dev/null)
        warn "GET $url → $code (redirect to $redirect)"
    else
        fail "GET $url → $code"
    fi
done

section "4. SSL CERTIFICATE"
cert_path="/etc/letsencrypt/live/licitometro.ar/fullchain.pem"
if [ -f "$cert_path" ]; then
    ok "SSL cert exists: $cert_path"
    # Check domains covered
    domains=$(openssl x509 -in "$cert_path" -text -noout 2>/dev/null | grep "DNS:" | tr ',' '\n' | tr -d ' ' | sed 's/DNS://')
    info "Domains in cert:"
    for d in $domains; do
        echo "    $d"
        if echo "$d" | grep -q "www"; then
            ok "www.licitometro.ar is in SSL cert"
        fi
    done
    # Check expiry
    expiry=$(openssl x509 -in "$cert_path" -enddate -noout 2>/dev/null | cut -d= -f2)
    info "Expires: $expiry"
    # Days until expiry
    expiry_ts=$(date -d "$expiry" +%s 2>/dev/null || date -jf "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null)
    now_ts=$(date +%s)
    if [ -n "$expiry_ts" ]; then
        days=$(( (expiry_ts - now_ts) / 86400 ))
        if [ $days -lt 15 ]; then
            fail "SSL cert expires in $days days - URGENT renewal needed!"
        elif [ $days -lt 30 ]; then
            warn "SSL cert expires in $days days"
        else
            ok "SSL cert valid for $days more days"
        fi
    fi
else
    fail "SSL cert NOT FOUND at $cert_path"
    warn "  Nginx running HTTP-only (nginx-initial.conf mode)"
fi

section "5. BACKEND HEALTH"
health=$(docker exec $BACKEND curl -s http://localhost:8000/api/health 2>/dev/null)
if echo "$health" | grep -q '"status":"healthy"'; then
    ok "Backend healthy"
    echo "$health" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'  licitaciones: {d.get(\"licitaciones_count\",\"?\")} | scrapers: {d.get(\"active_scrapers\",\"?\")} | scheduler: {d.get(\"scheduler\",\"?\")} | jobs: {d.get(\"scheduled_jobs\",\"?\")}')"
else
    fail "Backend health check failed: $health"
fi

section "6. MONGODB STATS"
lic_count=$(docker exec $MONGO mongosh licitaciones_db --quiet --eval "db.licitaciones.countDocuments()" 2>/dev/null)
scraper_count=$(docker exec $MONGO mongosh licitaciones_db --quiet --eval "db.scraper_configs.countDocuments({active:true})" 2>/dev/null)
ok "Licitaciones: ${lic_count:-?}"
ok "Active scraper configs: ${scraper_count:-?}"

# Scraper run history
echo ""
info "Last 5 scraper runs:"
docker exec $MONGO mongosh licitaciones_db --quiet --eval "
db.scraper_runs.find({},{scraper_name:1,status:1,items_found:1,started_at:1,ended_at:1}).sort({started_at:-1}).limit(5).forEach(r => {
    let dur = r.ended_at ? Math.round((r.ended_at - r.started_at)/1000) + 's' : 'running';
    print(r.scraper_name + ': ' + r.status + ' | items=' + (r.items_found||0) + ' | dur=' + dur);
})" 2>/dev/null

# Failed scrapers
echo ""
info "Scrapers failed in last 24h:"
docker exec $MONGO mongosh licitaciones_db --quiet --eval "
let since = new Date(Date.now() - 86400000);
db.scraper_runs.find({status:'failed', started_at:{'\$gt':since}},{scraper_name:1,error_message:1}).forEach(r => {
    print('  FAIL: ' + r.scraper_name + ' — ' + (r.error_message||'?').substring(0,100));
})" 2>/dev/null | head -20

section "7. SCRAPER CONFIG CHECK"
# Check for scrapers with no recent run
docker exec $MONGO mongosh licitaciones_db --quiet --eval "
let since = new Date(Date.now() - 7*86400000);
db.scraper_configs.find({active:true},{name:1,last_run:1}).forEach(c => {
    if (!c.last_run || c.last_run < since) {
        print('NO RECENT RUN: ' + c.name + ' (last=' + (c.last_run ? c.last_run.toISOString().substring(0,10) : 'never') + ')');
    }
})" 2>/dev/null | head -20

section "8. NGINX CONFIG SYNTAX"
docker exec $NGINX nginx -t 2>&1 && ok "Nginx config syntax OK" || fail "Nginx config has errors"

section "9. AUTH SYSTEM"
# Test login (expect 401 with wrong creds, not 500)
code=$(docker exec $BACKEND curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrongpassword"}' 2>/dev/null)
if [ "$code" = "401" ]; then
    ok "Auth endpoint responding correctly (401 on bad creds)"
elif [ "$code" = "200" ]; then
    warn "Auth accepted wrong credentials - check AUTH_PASSWORD_HASH"
else
    fail "Auth endpoint returned unexpected code: $code"
fi

section "10. DISK & MEMORY"
df -h / 2>/dev/null | tail -1 | awk '{print "Disk: " $3 " used / " $2 " total (" $5 " used)"}'
free -h 2>/dev/null | grep Mem | awk '{print "RAM: " $3 " used / " $2 " total"}'

# Docker volume sizes
info "MongoDB volume:"
docker system df -v 2>/dev/null | grep licitometro_mongo || echo "  (unable to check)"

section "11. ENRICHMENT STATUS"
docker exec $MONGO mongosh licitaciones_db --quiet --eval "
let l1 = db.licitaciones.countDocuments({enrichment_level:1});
let l2 = db.licitaciones.countDocuments({enrichment_level:2});
let l3 = db.licitaciones.countDocuments({enrichment_level:3});
let total = l1+l2+l3;
print('Enrichment levels: L1=' + l1 + ' L2=' + l2 + ' L3=' + l3 + ' (total=' + total + ')');
print('L1 pending enrichment: ' + l1 + ' items (' + Math.round(l1/total*100) + '%)');
" 2>/dev/null

section "12. SCHEDULER JOBS"
docker exec $BACKEND curl -s http://localhost:8000/api/scheduler/status 2>/dev/null | \
    python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(f'Running: {d.get(\"running\",\"?\")}')
    jobs = d.get('jobs', [])
    print(f'Scheduled jobs: {len(jobs)}')
    for j in jobs[:20]:
        nxt = j.get('next_run', 'N/A')
        if nxt and nxt != 'N/A':
            nxt = nxt[:19]
        print(f'  {j.get(\"name\",\"?\")}: next={nxt}')
except:
    print('Could not parse scheduler status')
" 2>/dev/null

section "13. RECENT ERRORS (backend log)"
docker logs $BACKEND --tail=50 2>&1 | grep -i "error\|exception\|traceback\|critical" | tail -20

echo ""
info "Diagnóstico completado: $(date)"
