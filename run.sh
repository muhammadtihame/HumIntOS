#!/bin/bash

# Exit on error
set -e

echo "Starting HumIntOS locally..."

# Set up backend
echo "Setting up backend..."
cd backend
# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
echo "Starting backend server..."
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Set up frontend
echo "Setting up frontend..."
cd frontend
npm install
echo "Starting frontend server..."
npm run dev &
FRONTEND_PID=$!
cd ..

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Servers stopped."
    exit 0
}

# Catch termination signals
trap cleanup SIGINT SIGTERM

echo "====================================="
echo "HumIntOS is running!"
echo "Backend API: http://localhost:8000"
echo "Frontend:    http://localhost:3000"
echo "Press Ctrl+C to stop both servers."
echo "====================================="

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID
