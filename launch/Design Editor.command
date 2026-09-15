#!/bin/bash
# Double-click this in Finder to open the design editor on a prototype.
#
# It does the four things you would otherwise do by hand: make sure your app is
# running, start the editor in front of it, forward the ports so your Mac can
# reach them, and open the browser.
#
# Edit the two lines under CONFIG if your prototype lives somewhere else.

# ---------------- CONFIG ----------------
CLOUDTOP="philhaoyang1.c.googlers.com"
PROTOTYPE="src/agent-platform-draft"   # relative to your home dir on the Cloudtop
PAGE="/overview"                        # which page to open
# ----------------------------------------

set -uo pipefail
PROXY=3456
WS=3457
SSH_OPTS=(-o ConnectTimeout=20 -o ProxyCommand="corp-ssh-helper %h %p")

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n\n" "$1"; echo "Press any key to close."; read -r -n 1; exit 1; }

cd "$(dirname "$0")/.." || exit 1

say "1/4  Connecting to your Cloudtop…"
echo "     (if your security key blinks, touch it)"
# Deliberately NOT BatchMode. The ssh-agent often wants a security-key touch or
# a passphrase, and BatchMode suppresses exactly that prompt — the check would
# then fail for a connection that would have worked if it had been allowed to
# ask. This window has a terminal, so let ssh use it.
if ! ssh "${SSH_OPTS[@]}" "$CLOUDTOP" 'echo ok' >/dev/null; then
  cat <<'HELP'

Could not reach the Cloudtop.

Almost always one of two things:
  • Your security key needs a touch — run `gcertstatus`, then `gcert` if it has
    expired, and touch the key when it blinks.
  • You are off the corp network.

Then double-click this again.
HELP
  echo "Press any key to close."; read -r -n 1; exit 1
fi

say "2/4  Starting the editor on the Cloudtop…"
# Kill any editor from a previous run, then start a fresh one. `--dev` starts
# the prototype's own dev server too if it is not already up.
ssh "${SSH_OPTS[@]}" "$CLOUDTOP" "
  export PATH=\$HOME/.local/opt/node-current/bin:\$HOME/.local/bin:\$PATH
  pkill -f 'design-editor/cli.mjs' 2>/dev/null
  sleep 1
  cd \$HOME/$PROTOTYPE || exit 1
  rm -f /tmp/design-editor.log
  setsid nohup node \$HOME/src/design-editor/cli.mjs --dev --no-open \
    --proxy-port $PROXY --ws-port $WS > /tmp/design-editor.log 2>&1 < /dev/null &
  echo started
" || die "Could not start the editor. See the message above."

say "3/4  Waiting for it to come up (a first build can take a minute)…"
for _ in $(seq 1 90); do
  if ssh "${SSH_OPTS[@]}" "$CLOUDTOP" "grep -q 'design-editor] proxy' /tmp/design-editor.log 2>/dev/null"; then
    READY=1; break
  fi
  printf "."
  sleep 3
done
echo
if [ "${READY:-0}" != "1" ]; then
  ssh "${SSH_OPTS[@]}" "$CLOUDTOP" 'tail -20 /tmp/design-editor.log' 2>/dev/null
  die "The editor did not come up. Its output is above."
fi

say "4/4  Connecting and opening your browser…"
# Forward the editor's two ports. Killed when you close this window.
ssh "${SSH_OPTS[@]}" -N \
  -L $PROXY:127.0.0.1:$PROXY \
  -L $WS:127.0.0.1:$WS \
  "$CLOUDTOP" &
TUNNEL=$!
trap 'kill $TUNNEL 2>/dev/null' EXIT

for _ in $(seq 1 20); do
  curl -s -m 3 -o /dev/null "http://127.0.0.1:$PROXY$PAGE" && break
  sleep 1
done

open "http://127.0.0.1:$PROXY$PAGE"

cat <<EOF

  ✅  Design editor is open at http://127.0.0.1:$PROXY$PAGE

  Keep this window open while you work — closing it disconnects the editor.
  Your edits land in the real files on the Cloudtop when you press
  "Apply to code".

EOF

# Hold the window open so the tunnel stays up.
wait $TUNNEL
