FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Define args and env for node
ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV

# Install dependencies based on package files in backend/
COPY backend/package*.json ./

# Install app dependencies
RUN npm ci --only=production

# Bundle app source from backend/
COPY backend/ ./backend/

# Bundle frontend source
COPY frontend/ ./frontend/

# Expose port
EXPOSE 3000

# Start server directly from root context (the server.js uses relative path ../frontend)
# Wait, server.js is in backend/, and expects ../frontend
WORKDIR /usr/src/app/backend

CMD [ "node", "server.js" ]
