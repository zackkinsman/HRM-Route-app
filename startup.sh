#!/bin/bash
echo "Installing dependencies..."
pip install --no-cache-dir -r /home/site/wwwroot/requirements.txt

echo "Starting Gunicorn..."
exec gunicorn -w 4 -b 0.0.0.0:8000 app:app