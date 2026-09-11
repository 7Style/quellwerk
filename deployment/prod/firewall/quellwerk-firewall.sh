#!/usr/bin/env bash
# ==============================================================================
# Quellwerk, Firewall-Regeln fuer das Container-Netz auf "intern".
#
# Der Docker-Daemon laeuft dort mit "iptables": false und fasst die Firewall
# nicht an. Jeder Stack legt deshalb seine eigenen Regeln an. Vorbild ist
# nexom-firewall, das auf demselben Server so laeuft.
#
# Ablage:   /usr/local/sbin/quellwerk-firewall.sh
# Start:    quellwerk-firewall.service (Type=oneshot, After=docker.service)
#
# Jede Regel wird vor dem Einfuegen mit `iptables -C` geprueft, damit ein zweiter
# Lauf nichts verdoppelt. Das Skript ist damit gefahrlos wiederholbar.
# ==============================================================================
set -euo pipefail

BRIDGE="br-quellwerk"
NETWORK="quellwerk_internal"
WAIT_SECONDS="${WAIT_SECONDS:-60}"

log() { printf '%s quellwerk-firewall: %s\n' "$(date -Is)" "$*"; }

# 1. Warten, bis das Docker-Netz existiert. Die Unit startet nach docker.service,
#    aber das Netz entsteht erst mit dem ersten `compose up`.
waited=0
while ! ip link show "$BRIDGE" >/dev/null 2>&1; do
  if [ "$waited" -ge "$WAIT_SECONDS" ]; then
    log "Bridge ${BRIDGE} nach ${WAIT_SECONDS}s nicht da, nichts zu tun"
    exit 0
  fi
  sleep 2
  waited=$((waited + 2))
done
log "Bridge ${BRIDGE} vorhanden nach ${waited}s"

# 2. Subnetz aus dem Netz auslesen, nicht im Skript wiederholen: Compose und
#    Firewall koennen so nicht auseinanderlaufen.
SUBNET="$(docker network inspect "$NETWORK" \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
if [ -z "$SUBNET" ]; then
  log "Subnetz von ${NETWORK} nicht lesbar, Abbruch"
  exit 1
fi
log "Subnetz ${SUBNET}"

# Ausgehendes Interface: das mit der Default-Route.
WAN="$(ip route show default | awk '/default/ {print $5; exit}')"
if [ -z "$WAN" ]; then
  log "kein Interface mit Default-Route gefunden, Abbruch"
  exit 1
fi
log "WAN-Interface ${WAN}"

ensure() {
  local table=$1; shift
  if iptables -t "$table" -C "$@" 2>/dev/null; then
    log "steht bereits: -t ${table} $*"
  else
    iptables -t "$table" -I "$@"
    log "gesetzt: -t ${table} $*"
  fi
}

# 3. MASQUERADE: mit abgeschalteten iptables legt Docker kein NAT an, ohne das
#    erreicht kein Container api.anthropic.com.
ensure nat POSTROUTING -s "$SUBNET" -o "$WAN" -j MASQUERADE

# 4. DOCKER-USER: Egress nach draussen und die Antworten zurueck. Die Kette wird
#    angelegt und aus FORWARD angesprungen, falls sie fehlt; mit "iptables": false
#    erzeugt der Daemon sie nicht von selbst.
if ! iptables -L DOCKER-USER -n >/dev/null 2>&1; then
  iptables -N DOCKER-USER
  log "Kette DOCKER-USER angelegt"
fi
if ! iptables -C FORWARD -j DOCKER-USER 2>/dev/null; then
  iptables -I FORWARD -j DOCKER-USER
  log "FORWARD springt jetzt nach DOCKER-USER"
fi

ensure filter DOCKER-USER -i "$BRIDGE" -o "$WAN" -s "$SUBNET" -j ACCEPT
ensure filter DOCKER-USER -i "$WAN" -o "$BRIDGE" -d "$SUBNET" \
  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

log "fertig"
