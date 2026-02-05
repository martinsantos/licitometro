#!/bin/bash
# Start development environment for Licitometro

echo "========================================="
echo "  LICITOMETRO - Development Starter"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cd "$(dirname "$0")/.."

# Check if MongoDB is running
echo -e "${BLUE}Checking MongoDB...${NC}"
if pgrep -x "mongod" > /dev/null; then
    echo -e "${GREEN}✓ MongoDB is running${NC}"
else
    echo -e "${YELLOW}⚠ MongoDB is not running. Starting it...${NC}"
    mongod --fork --logpath /tmp/mongodb.log --dbpath /tmp/mongodb_data 2>/dev/null || mkdir -p /tmp/mongodb_data && mongod --fork --logpath /tmp/mongodb.log --dbpath /tmp/mongodb_data
    sleep 2
fi

# Initialize scraper configs
echo -e "${BLUE}Initializing scraper configs...${NC}"
python3 scripts/init_scraper_configs.py

# Check Python dependencies
echo -e "${BLUE}Checking Python dependencies...${NC}"
pip3 show apscheduler > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Installing Python dependencies...${NC}"
    pip3 install -r backend/requirements.txt
fi

# Start Backend
echo -e "${BLUE}Starting Backend (Port 8001)...${NC}"
cd backend
python3 server.py &
BACKEND_PID=$!
cd ..

echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

# Wait for backend to be ready
echo -e "${BLUE}Waiting for backend to be ready...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:8001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready${NC}"
        break
    fi
    sleep 1
done

# Start Frontend
echo -e "${BLUE}Starting Frontend (Port 3000)...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
fi

npm start &
FRONTEND_PID=$!
cd ..

echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}  All services started!${NC}"
echo "========================================="
echo ""
echo -e "  Frontend: ${BLUE}http://localhost:3000${NC}"
echo -e "  Backend:  ${BLUE}http://localhost:8001${NC}"
echo -e "  API Docs: ${BLUE}http://localhost:8001/docs${NC}"
echo ""
echo -e "  Admin Panel: ${BLUE}http://localhost:3000/admin${NC}"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Trap Ctrl+C to kill all processes
trap "echo -e '${RED}Stopping services...${NC}'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Wait for processes
wait
