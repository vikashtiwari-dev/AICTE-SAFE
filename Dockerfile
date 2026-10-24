# AICTE Security Deposit & FDR Portal - Production Dockerfile
FROM node:24-alpine

WORKDIR /app

# Copy root, backend and frontend dependencies
COPY package.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm install
RUN cd frontend && npm install

# Copy source files
COPY backend ./backend
COPY frontend ./frontend

# Build frontend and backend
RUN cd frontend && npm run build
RUN cd backend && npm run build

# Seed initial database
RUN cd backend && npm run seed

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["npm", "start", "--prefix", "backend"]
