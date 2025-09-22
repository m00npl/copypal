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

# Production stage with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Create proper nginx config for SPA with cache control
RUN echo 'server {' > /etc/nginx/conf.d/default.conf && \
    echo '    listen       80;' >> /etc/nginx/conf.d/default.conf && \
    echo '    server_name  localhost;' >> /etc/nginx/conf.d/default.conf && \
    echo '    root   /usr/share/nginx/html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    index  index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    ' >> /etc/nginx/conf.d/default.conf && \
    echo '    # Cache static assets with hash in filename for 1 year' >> /etc/nginx/conf.d/default.conf && \
    echo '    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {' >> /etc/nginx/conf.d/default.conf && \
    echo '        expires 1y;' >> /etc/nginx/conf.d/default.conf && \
    echo '        add_header Cache-Control "public, immutable";' >> /etc/nginx/conf.d/default.conf && \
    echo '        try_files $uri =404;' >> /etc/nginx/conf.d/default.conf && \
    echo '    }' >> /etc/nginx/conf.d/default.conf && \
    echo '    ' >> /etc/nginx/conf.d/default.conf && \
    echo '    # Never cache index.html and manifest files' >> /etc/nginx/conf.d/default.conf && \
    echo '    location ~* \.(html|json)$ {' >> /etc/nginx/conf.d/default.conf && \
    echo '        expires -1;' >> /etc/nginx/conf.d/default.conf && \
    echo '        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";' >> /etc/nginx/conf.d/default.conf && \
    echo '        add_header Pragma "no-cache";' >> /etc/nginx/conf.d/default.conf && \
    echo '        try_files $uri $uri/ /index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    }' >> /etc/nginx/conf.d/default.conf && \
    echo '    ' >> /etc/nginx/conf.d/default.conf && \
    echo '    # All other files (including SPA routing)' >> /etc/nginx/conf.d/default.conf && \
    echo '    location / {' >> /etc/nginx/conf.d/default.conf && \
    echo '        try_files $uri $uri/ /index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    }' >> /etc/nginx/conf.d/default.conf && \
    echo '}' >> /etc/nginx/conf.d/default.conf

EXPOSE 80