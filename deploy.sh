#!/bin/bash

source /etc/marquinhos/marquinhos-api.conf

CERTIFICATE_PATH="/home/guilherme/certificates/marquinhos/server.crt"
KEY_PATH="/home/guilherme/certificates/marquinhos/server.key"

DESTINATION_DIR="/home/guilherme/github-runners/marquinhos-api-runner/_work/marquinhos-web-api/marquinhos-web-api/dist"

cp "$CERTIFICATE_PATH" "$DESTINATION_DIR"
cp "$KEY_PATH" "$DESTINATION_DIR"

chmod 744 "$DESTINATION_DIR/server.key"
chmod 744 "$DESTINATION_DIR/server.crt"

service=$(cat << EOF
[Unit]

Description=Marquinhos API

After=network.target

[Service]

Environment="MONGO_URI=$MONGO_URI"
Environment="MONGO_DATABASE_NAME=$MONGO_DATABASE_NAME"
Environment="LASTFM_API_KEY=$LASTFM_API_KEY"
Environment="LASTFM_SHARED_SECRET=$LASTFM_SHARED_SECRET"
Environment="MARQUINHOS_API_KEY=$MARQUINHOS_API_KEY"
Environment="DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID"
Environment="DISCORD_CLIENT_SECRET=$DISCORD_CLIENT_SECRET"
Environment="DISCORD_REDIRECT_URI=$DISCORD_REDIRECT_URI"
Environment="LASTFM_REDIRECT_URI=$LASTFM_REDIRECT_URI"
Environment="SPOTIFY_CLIENT_ID=$SPOTIFY_CLIENT_ID"
Environment="SPOTIFY_CLIENT_SECRET=$SPOTIFY_CLIENT_SECRET"

User=guilherme

KillMode=control-group

WorkingDirectory=/home/guilherme/github-runners/marquinhos-api-runner/_work/marquinhos-web-api/marquinhos-web-api/dist

ExecStart=/home/guilherme/.nvm/versions/node/v18.13.0/bin/node ./index.js

Restart=always

RestartSec=30

StartLimitInterval=0


[Install]

WantedBy=multi-user.target

EOF

)

systemctl stop marquinhos-api.service

echo "$service" > /etc/systemd/system/marquinhos-api.service

systemctl daemon-reload

systemctl enable marquinhos-api.service

systemctl start marquinhos-api.service

systemctl status marquinhos-api.service

