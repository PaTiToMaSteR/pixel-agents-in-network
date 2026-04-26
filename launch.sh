#!/bin/sh
set -eu

cd "$(dirname "$0")"

printf "Your Pixel Agents name: "
IFS= read -r agent_name

while [ -z "$agent_name" ]; do
  printf "Name cannot be empty. Your Pixel Agents name: "
  IFS= read -r agent_name
done

printf "Stopping stale Pixel Agents ports if needed...\n"
pids=$(
  {
    lsof -tiTCP:4555 -sTCP:LISTEN
    lsof -tiTCP:8787 -sTCP:LISTEN
    lsof -tiUDP:47877
  } 2>/dev/null | sort -u
)

if [ -n "$pids" ]; then
  printf "%s\n" "$pids" | xargs kill 2>/dev/null || true
  sleep 1

  remaining_pids=$(
    {
      lsof -tiTCP:4555 -sTCP:LISTEN
      lsof -tiTCP:8787 -sTCP:LISTEN
      lsof -tiUDP:47877
    } 2>/dev/null | sort -u
  )

  if [ -n "$remaining_pids" ]; then
    printf "%s\n" "$remaining_pids" | xargs kill -9 2>/dev/null || true
  fi
else
  printf "No stale Pixel Agents listeners found.\n"
fi

git pull
exec npm run dev -- --name "$agent_name"
