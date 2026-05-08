FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Create data directory
RUN mkdir -p data/papers data/analysis

# Expose port
EXPOSE 3001

# Start the app
CMD ["node", "server.js"]
