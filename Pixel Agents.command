#!/bin/zsh

APP_DIR="/Users/rafamartin/pixel-agents-in-network"
LOG_FILE="$APP_DIR/.pixel-agents.log"

clear
cat <<'BANNER'
  ____  _          _      _                         _       
 |  _ \(_)__  _____| |    / \   __ _  ___ _ __  ___| |_ ___ 
 | |_) | \ \/ / _ \ |   / _ \ / _` |/ _ \ '_ \/ __| __/ __|
 |  __/| |>  <  __/ |  / ___ \ (_| |  __/ | | \__ \ |_\__ \
 |_|   |_/_/\_\___|_| /_/   \_\__, |\___|_| |_|___/\__|___/
                              |___/                         

       Pixel Agents In Network - Local Launcher
BANNER
echo ""

if [[ ! -d "$APP_DIR" ]]; then
  echo "+----------------------------------------------------------+"
  echo "| ERROR                                                    |"
  echo "+----------------------------------------------------------+"
  echo "No encuentro la app en: $APP_DIR"
  echo ""
  echo "Pulsa Enter para cerrar."
  read
  exit 1
fi

cat <<'INFO'
+----------------------------------------------------------+
| INSTRUCCIONES                                            |
+----------------------------------------------------------+
| 1. Escribe el nombre que quieres mostrar en la oficina.   |
| 2. Si lo dejas vacio, se usara tu nombre de git/host.     |
| 3. Se abrira el navegador automaticamente.                |
| 4. Para detener Pixel Agents, vuelve aqui y pulsa Ctrl+C.  |
+----------------------------------------------------------+
INFO
echo ""
echo "        o__        o__        o__"
echo "       /|          /|          /|"
echo "       / \\        / \\        / \\"
echo "    [agent]    [agent]    [agent]"
echo ""
echo "+----------------------------------------------------------+"
echo "| NOMBRE                                                   |"
echo "+----------------------------------------------------------+"
read "PIXEL_NAME? > "

if [[ -z "${PIXEL_NAME// /}" ]]; then
  PIXEL_NAME="$(git -C "$APP_DIR" config user.name 2>/dev/null || hostname)"
fi

echo ""
echo "+----------------------------------------------------------+"
echo "| ARRANCANDO                                               |"
echo "+----------------------------------------------------------+"
echo "Nombre visible: $PIXEL_NAME"
echo "Proyecto: $APP_DIR"
echo "URL local: http://127.0.0.1:4555"
echo "Logs: $LOG_FILE"
echo ""

cd "$APP_DIR" || exit 1
export PIXEL_AGENTS_MACHINE_NAME="$PIXEL_NAME"

echo "Limpiando instancias anteriores de Pixel Agents..."
pkill -f "$APP_DIR/scripts/network.mjs" 2>/dev/null
pkill -f "$APP_DIR/scripts/broadcaster.mjs" 2>/dev/null
pkill -f "$APP_DIR/scripts/hub.mjs" 2>/dev/null
for PID in $(lsof -ti tcp:4555 2>/dev/null); do
  kill -TERM "$PID" 2>/dev/null
done
sleep 2

: > "$LOG_FILE"
npm run dev -- --name "$PIXEL_NAME" > "$LOG_FILE" 2>&1 &
APP_PID=$!

stop_app() {
  printf "\nDeteniendo Pixel Agents...\n"
  kill -TERM "$APP_PID" 2>/dev/null
  wait "$APP_PID" 2>/dev/null
}

trap stop_app INT TERM

SPINNER=("|" "/" "-" "\\")
INDEX=0

while kill -0 "$APP_PID" 2>/dev/null; do
  FRAME=${SPINNER[$(( (INDEX % 4) + 1 ))]}
  printf "\r[%s] Pixel Agents activo | Nombre: %s | URL: http://127.0.0.1:4555 | Ctrl+C para parar" "$FRAME" "$PIXEL_NAME"
  INDEX=$((INDEX + 1))
  sleep 1
done

wait "$APP_PID"
EXIT_CODE=$?
trap - INT TERM
printf "\n"

if [[ "$EXIT_CODE" -ne 0 ]]; then
  echo "Pixel Agents termino con error. Ultimas lineas del log:"
  tail -n 20 "$LOG_FILE"
fi

echo ""
echo "+----------------------------------------------------------+"
echo "| Pixel Agents se ha detenido. Pulsa Enter para cerrar.    |"
echo "+----------------------------------------------------------+"
read
