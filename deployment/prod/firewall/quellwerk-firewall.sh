#!/usr/bin/env bash
# ==============================================================================
# Quellwerk, Firewall-Regeln fuer das Container-Netz auf "intern".
#
# Der Docker-Daemon laeuft dort mit "iptables": false und fasst die Firewall
# nicht an. Jeder Stack legt deshalb seine eigenen Regeln an. Vorbild und
# Nachbar ist /usr/local/bin/nexom-firewall.sh; diese Datei folgt ihm bewusst
# Zeile fuer Zeile.
#
# Ablage:   /usr/local/bin/quellwerk-firewall.sh
# Start:    quellwerk-firewall.service (Type=oneshot, After=docker.service)
#
# Zwei Dinge, die nicht offensichtlich sind und die man nur einmal falsch macht:
#
#   1. Die ACCEPT-Regeln gehen mit `-I DOCKER-USER 1` an den ANFANG der Kette,
#      nie mit `-A`. Am Ende von DOCKER-USER steht auf diesem Server eine
#      DROP-Regel von orbynt fuer eingehendes TCP auf ens192. Angehaengte Regeln
#      stuenden dahinter und waeren wirkungslos.
#   2. Ohne MASQUERADE erreicht kein Container api.anthropic.com, denn mit
#      abgeschalteten iptables legt Docker kein NAT an.
#
# Jede Regel wird vor dem Einfuegen mit `iptables -C` geprueft, damit ein
# zweiter Lauf nichts verdoppelt. Das Skript ist damit gefahrlos wiederholbar.
# ==============================================================================
set -uo pipefail

NET="${QW_NETWORK:-quellwerk_internal}"

log() { printf '%s quellwerk-firewall: %s\n' "$(date -Is)" "$*"; }

# Warten, bis das Docker-Netz existiert: die Unit startet nach docker.service,
# aber das Netz entsteht erst mit dem ersten `compose up`. Das Subnetz wird aus
# dem Netz gelesen und nicht im Skript wiederholt, damit Compose und Firewall
# nicht auseinanderlaufen koennen.
for _ in $(seq 1 30); do
  SUB=$(docker network inspect "$NET" -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null)
  [ -n "${SUB:-}" ] && break
  sleep 2
done

if [ -z "${SUB:-}" ]; then
  log "Netz ${NET} nicht da, nichts zu tun"
  exit 0
fi

# Auf "intern" legt Docker die Kette nicht an, weil es die Firewall nicht
# verwaltet; dort existiert sie bereits durch einen anderen Stack. Die beiden
# Blöcke greifen deshalb nur auf einem Server, auf dem sie fehlt.
if ! iptables -L DOCKER-USER -n >/dev/null 2>&1; then
  iptables -N DOCKER-USER
  log "Kette DOCKER-USER angelegt"
fi
if ! iptables -C FORWARD -j DOCKER-USER 2>/dev/null; then
  iptables -I FORWARD 1 -j DOCKER-USER
  log "FORWARD springt jetzt nach DOCKER-USER"
fi

iptables -t nat -C POSTROUTING -s "$SUB" -j MASQUERADE 2>/dev/null \
  || iptables -t nat -A POSTROUTING -s "$SUB" -j MASQUERADE

iptables -C DOCKER-USER -s "$SUB" -j ACCEPT 2>/dev/null \
  || iptables -I DOCKER-USER 1 -s "$SUB" -j ACCEPT

iptables -C DOCKER-USER -d "$SUB" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null \
  || iptables -I DOCKER-USER 1 -d "$SUB" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

log "Egress-Regeln gesetzt: ${NET} (${SUB})"
