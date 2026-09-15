#!/bin/bash
# Double-click this in Finder to open the design editor.
#
# It lands you on the PROJECT CHOOSER, which lists the prototypes running on
# your Cloudtop and lets you pick one — and switch to another later without
# coming back here. It does the parts you would otherwise do by hand: start the
# chooser, connect the ports, open the browser.
#
# An earlier version of this script named one prototype and passed `--dev`,
# which skips the chooser and attaches straight to that app. That is the right
# shape for a script you run in one repo all day and the wrong one for a
# launcher, which is exactly the moment you have not yet said which prototype
# you mean.

# ---------------- CONFIG ----------------
CLOUDTOP="philhaoyang1.c.googlers.com"
# ----------------------------------------

set -uo pipefail

# The chooser, and the two ports it hands to whichever editor you start from it.
# All three are forwarded up front, because pressing Start sends your tab
# straight to the editor and a port that arrives late reads as a broken editor.
CHOOSER=3455
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

# A forward left on the shared connection by an older version of this script,
# or by a run that was killed outright. Harmless when there is none.
ssh "${SSH_OPTS[@]}" -O cancel -L $PROXY:127.0.0.1:$PROXY -L $WS:127.0.0.1:$WS \
  "$CLOUDTOP" >/dev/null 2>&1

# Forwards a previous run left on the shared connection, or that a run killed
# outright never took down. Harmless when there are none.
FORWARDS=(-L "$CHOOSER:127.0.0.1:$CHOOSER" -L "$PROXY:127.0.0.1:$PROXY" -L "$WS:127.0.0.1:$WS")
ssh "${SSH_OPTS[@]}" -O cancel "${FORWARDS[@]}" "$CLOUDTOP" >/dev/null 2>&1

say "2/4  Starting the chooser on the Cloudtop…"
# With no port argument the editor opens its project chooser rather than
# attaching to one app. That is the point of this script: the chooser outlives
# the choice, so switching prototypes is a click in the editor's toolbar rather
# than another trip through here.
#
# The previous run is found BY PORT, not by a command-line pattern.
# `pkill -f design-editor/cli.mjs` looks right and is a trap: that string also
# appears in the ssh command being sent, so pkill matches the shell running it
# and kills itself. The symptom is exit 255 with no output, which reads like the
# connection dropped.
ssh "${SSH_OPTS[@]}" "$CLOUDTOP" "
  export PATH=\$HOME/.local/opt/node-current/bin:\$HOME/.local/bin:\$PATH
  for port in $CHOOSER $PROXY $WS; do
    old=\$(lsof -ti tcp:\$port -s tcp:LISTEN 2>/dev/null | head -1)
    [ -n \"\$old\" ] && kill \$old 2>/dev/null
  done
  sleep 2
  cd \$HOME || exit 1
  rm -f /tmp/design-editor.log
  setsid nohup node \$HOME/src/design-editor/cli.mjs --no-open \
    --start-screen-port $CHOOSER --proxy-port $PROXY --ws-port $WS \
    > /tmp/design-editor.log 2>&1 < /dev/null &
  echo started
" || die "Could not start the chooser. See the message above."

say "3/4  Waiting for it to come up…"
for _ in $(seq 1 40); do
  if ssh "${SSH_OPTS[@]}" "$CLOUDTOP" "grep -q 'to choose an app' /tmp/design-editor.log 2>/dev/null"; then
    READY=1; break
  fi
  printf "."
  sleep 2
done
echo
if [ "${READY:-0}" != "1" ]; then
  ssh "${SSH_OPTS[@]}" "$CLOUDTOP" 'tail -20 /tmp/design-editor.log' 2>/dev/null
  die "The chooser did not come up. Its output is above."
fi

say "4/4  Connecting and opening your browser…"
# Forward the editor's two ports onto the connection we ALREADY authenticated
# in step 1, rather than opening a second one.
#
# The obvious `ssh -N -L …` is wrong here in two different ways, and they pull
# in opposite directions. Left on the machine's shared connection
# (`ControlMaster auto`, `ControlPersist yes` in ~/.ssh/config) the forward
# outlives this window, so closing it leaves the ports open and the next run
# silently reuses a tunnel pointing at an editor that is gone. Forced onto its
# own connection with `ControlPath=none` it needs a SECOND security-key touch,
# which is precisely the friction this launcher exists to remove.
#
# `-O forward` asks the existing connection to add the forward and returns
# immediately; `-O cancel` takes it away again. One touch, and a real teardown.
ssh "${SSH_OPTS[@]}" -O forward "${FORWARDS[@]}" "$CLOUDTOP" >/dev/null 2>&1 \
  || die "Could not connect the ports."

# On the signals a closed Terminal window actually sends, not just on a clean
# exit: an EXIT trap alone does not run when the shell is terminated.
cleanup() {
  ssh "${SSH_OPTS[@]}" -O cancel "${FORWARDS[@]}" "$CLOUDTOP" >/dev/null 2>&1
}
trap cleanup EXIT INT TERM HUP

for _ in $(seq 1 20); do
  curl -s -m 3 -o /dev/null "http://127.0.0.1:$CHOOSER/" && break
  sleep 1
done

open "http://127.0.0.1:$CHOOSER/"

cat <<EOF

  ✅  Project chooser is open at http://127.0.0.1:$CHOOSER

      Pick a prototype and press Start. To switch to another one later, use
      the "Choose app" button in the editor's toolbar — no need to come back
      here.

  Keep this window open while you work — closing it disconnects the editor.
  Your edits land in the real files on the Cloudtop when you press
  "Apply to code".

EOF

# Hold the window open. The forwards live on the shared connection, so it is
# `cleanup` that ends them, not this process exiting.
while true; do sleep 3600; done
