FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Create directories for SQL files and schema results
RUN mkdir -p /app/sql_files /app/schema_results

# Set environment variables
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "index.js"]