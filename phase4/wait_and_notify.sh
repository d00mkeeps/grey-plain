#!/bin/bash
# Polling script that checks the Vast.ai tmux session, downloads results, and triggers a macOS notification

HOST="root@79.160.189.79"
PORT="14055"
REMOTE_P="ssh -p $PORT $HOST"
echo "Monitoring remote pipeline every 60 seconds..."

# Wait as long as the tmux session 'pipeline' is active
while $REMOTE_P "tmux list-sessions 2>/dev/null | grep -q pipeline"; do
    sleep 60
done

echo "Remote pipeline finished! Downloading results..."
scp -r -P $PORT $HOST:/workspace/data/regression/ "./data/"

echo "Triggering notification..."
# Native macOS notification popup
osascript -e 'display notification "The Vast.ai training pipeline has finished and results are downloaded." with title "Pipeline Complete"'

# Play a voice alert so you hear it even if you're away from the screen
say "The pipeline is complete. Results have been downloaded."

# Send email via macOS Mail app
osascript -e 'tell application "Mail"
    set theMessage to make new outgoing message with properties {subject:"Pipeline Complete", content:"The Vast.ai training pipeline has finished and results are downloaded.", visible:false}
    tell theMessage
        make new to recipient at end of to recipients with properties {address:"miles.i.hillary@gmail.com"}
        send
    end tell
end tell'
