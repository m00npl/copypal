FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build for production
RUN bun run build

# Production stage - serve directly with bun
FROM oven/bun:1

WORKDIR /app

COPY --from=builder /app/dist ./public

# Simple static server
RUN echo 'Bun.serve({' > server.js && \
    echo '  port: 80,' >> server.js && \
    echo '  hostname: "0.0.0.0",' >> server.js && \
    echo '  fetch(req) {' >> server.js && \
    echo '    const url = new URL(req.url);' >> server.js && \
    echo '    const path = url.pathname === "/" ? "/index.html" : url.pathname;' >> server.js && \
    echo '    const file = Bun.file(`./public${path}`);' >> server.js && \
    echo '    if (file.size === 0 && path !== "/index.html") {' >> server.js && \
    echo '      return new Response(Bun.file("./public/index.html"));' >> server.js && \
    echo '    }' >> server.js && \
    echo '    return new Response(file);' >> server.js && \
    echo '  }' >> server.js && \
    echo '});' >> server.js

EXPOSE 80

CMD ["bun", "server.js"]