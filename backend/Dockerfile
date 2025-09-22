FROM oven/bun:1 AS base

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production run
EXPOSE 19234
CMD ["bun", "run", "start"]