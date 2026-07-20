#!/usr/bin/env bash
set -euo pipefail

for command_name in mongodump mongorestore mongod node; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 1
  }
done

if [[ -z "${MONGODB_URI:-}" && -f .env ]]; then
  MONGODB_URI="$(node -e "require('dotenv').config(); process.stdout.write(process.env.MONGODB_URI || '')")"
  export MONGODB_URI
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
  printf 'MONGODB_URI must be injected by the approved secret manager or local .env.\n' >&2
  exit 1
fi

verify_port="${BACKUP_VERIFY_PORT:-27028}"
work_dir="$(mktemp -d /tmp/attraction-network-backup-verify.XXXXXX)"
archive="$work_dir/backup.archive.gz"
dump_config="$work_dir/mongodb-tools.yml"
restore_dir="$work_dir/mongodb"
mongod_pid=''

cleanup() {
  if [[ -n "$mongod_pid" ]]; then
    kill "$mongod_pid" 2>/dev/null || true
    wait "$mongod_pid" 2>/dev/null || true
  fi
  find "$work_dir" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$restore_dir"
node -e 'process.stdout.write(`uri: ${JSON.stringify(process.env.MONGODB_URI)}\n`)' >"$dump_config"
chmod 600 "$dump_config"
mongodump --config="$dump_config" --archive="$archive" --gzip --quiet

mongod \
  --dbpath "$restore_dir" \
  --port "$verify_port" \
  --bind_ip 127.0.0.1 \
  --nounixsocket \
  --quiet >"$work_dir/mongod.log" 2>&1 &
mongod_pid=$!

for _attempt in {1..30}; do
  if VERIFY_URI="mongodb://127.0.0.1:${verify_port}/admin" node - <<'NODE' >/dev/null 2>&1
const mongoose = require('mongoose');
mongoose.connect(process.env.VERIFY_URI, { serverSelectionTimeoutMS: 500 })
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
NODE
  then
    break
  fi
  sleep 1
done

mongorestore \
  --host 127.0.0.1 \
  --port "$verify_port" \
  --archive="$archive" \
  --gzip \
  --quiet

VERIFY_PORT="$verify_port" node - <<'NODE'
const mongoose = require('mongoose');

(async () => {
  const source = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const restored = await mongoose
    .createConnection(`mongodb://127.0.0.1:${process.env.VERIFY_PORT}/${source.name}`)
    .asPromise();
  const collectionNames = (await source.db.listCollections({}, { nameOnly: true }).toArray())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('system.'));
  let sourceDocuments = 0;
  let restoredDocuments = 0;
  const mismatches = [];

  for (const name of collectionNames) {
    const sourceCount = await source.db.collection(name).countDocuments({});
    const restoredCount = await restored.db.collection(name).countDocuments({});
    sourceDocuments += sourceCount;
    restoredDocuments += restoredCount;
    if (sourceCount !== restoredCount) mismatches.push(name);
  }

  const bookingCount = collectionNames.includes('bookings')
    ? await restored.db.collection('bookings').countDocuments({})
    : 0;
  console.log(JSON.stringify({
    status: mismatches.length === 0 ? 'pass' : 'fail',
    collections: collectionNames.length,
    sourceDocuments,
    restoredDocuments,
    bookings: bookingCount,
    mismatchedCollections: mismatches.length,
  }));

  await Promise.all([source.close(), restored.close()]);
  if (mismatches.length > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Backup verification failed');
  process.exitCode = 1;
});
NODE

archive_bytes="$(stat -f %z "$archive" 2>/dev/null || stat -c %s "$archive")"
archive_hash="$(shasum -a 256 "$archive" | awk '{print $1}')"
printf 'archive_bytes=%s\narchive_sha256=%s\n' "$archive_bytes" "$archive_hash"
