#!/bin/bash
cd "$(dirname "$0")"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

npm start &
PID=$!
wait $PID
