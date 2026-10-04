#!/bin/sh
# Starts the push notifier next to nginx and restarts it if it ever exits.
# nginx's entrypoint runs this before starting nginx; the loop keeps running
# in the background for the container's lifetime.
set -e
mkdir -p /data/notifier
(
  while true; do
    node /opt/notifier/server.mjs || true
    echo "notifier exited; restarting in 5s"
    sleep 5
  done
) &
