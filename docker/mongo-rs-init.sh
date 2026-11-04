#!/usr/bin/env bash
set -euo pipefail

/usr/local/bin/docker-entrypoint.sh mongod --replSet rs0 --bind_ip_all --keyFile /etc/mongo-keyfile/keyfile &
mongo_pid=$!

cleanup() {
  kill "$mongo_pid" 2>/dev/null || true
  wait "$mongo_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

auth_args=(
  --quiet
  --username "${MONGO_INITDB_ROOT_USERNAME}"
  --password "${MONGO_INITDB_ROOT_PASSWORD}"
  --authenticationDatabase admin
)

until mongosh "${auth_args[@]}" --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q '^1$'; do
  sleep 1
done

mongosh "${auth_args[@]}" --eval "
try {
  rs.status();
  print('replica set already initialized');
} catch (error) {
  if (!String(error).includes('no replset config')) {
    throw error;
  }
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongodb:27017' }],
  });
  print('replica set initiated');
}
"

until mongosh "${auth_args[@]}" --eval "db.hello().isWritablePrimary" 2>/dev/null | grep -q '^true$'; do
  sleep 1
done

wait "$mongo_pid"
