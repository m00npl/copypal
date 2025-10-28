# CopyPal

A temporary, cross-device clipboard backed by DB-Chain. Share text, files, and data across devices with customizable expiration times.

## Features

- 📋 Cross-device clipboard sharing
- ⏰ Customizable expiration times
- 🔒 Secure storage on blockchain
- 📱 Responsive web interface
- 🎨 Modern dark theme UI
- 📧 Email notifications
- 🔄 Real-time synchronization

## Architecture

CopyPal consists of two main components:

- **Frontend**: React + TypeScript application built with Vite
- **Backend**: Node.js API server with blockchain integration

## Prerequisites

- Docker and Docker Compose
- Git
- A SendGrid account for email functionality
- Access to Arkiv blockchain network

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/m00npl/copypal.git
cd copypal
```

### 2. Configure environment variables

Copy the example environment files and fill in your values:

```bash
# Root environment
cp .env.example .env

# Backend environment
cp backend/.env.example backend/.env

# Frontend environment (optional for custom API endpoint)
cp frontend/.env.example frontend/.env
```

### 3. Fill in your credentials

Edit the `.env` file with your actual values:

```bash
# Required: Your Ethereum private key
ARKIV_PRIVATE_KEY=your_private_key_here

# Required: Your SendGrid API key
SENDGRID_API_KEY=your_sendgrid_api_key_here

# Required: Your domain
FROM_EMAIL=noreply@yourdomain.com
BASE_URL=https://yourdomain.com/api
```

### 4. Deploy with Docker Compose

```bash
docker compose up -d
```

The application will be available at:
- Frontend: http://localhost:8881
- Backend API: http://localhost:19234

## Production Deployment

### Server Requirements

- Ubuntu 20.04+ or similar Linux distribution
- Docker and Docker Compose installed
- Domain name with SSL certificate
- Reverse proxy (nginx recommended)

### Deployment Steps

1. **Clone and configure on your server:**

```bash
git clone https://github.com/m00npl/copypal.git
cd copypal

# Copy and configure environment
cp .env.example .env
# Edit .env with your production values
```

2. **Build and deploy:**

```bash
# Build backend image
cd backend
docker buildx build --platform linux/amd64 -t yourusername/copypal-backend:latest . --push

# Build frontend image
cd ../frontend
docker buildx build --platform linux/amd64 -t yourusername/copypal-frontend:latest . --push

# Update docker-compose.yml with your image names
cd ..
# Edit docker-compose.yml to use your images

# Deploy
docker compose up -d
```

3. **Configure reverse proxy (nginx example):**

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8881;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:19234;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Environment Variables

### Backend Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (production/development) | No |
| `PORT` | Backend server port | No (default: 19234) |
| `ARKIV_RPC_URL` | Arkiv blockchain RPC endpoint | Yes |
| `ARKIV_WS_URL` | Arkiv blockchain WebSocket endpoint | Yes |
| `ARKIV_CHAIN_ID` | Arkiv blockchain chain ID | Yes |
| `ARKIV_PRIVATE_KEY` | Your Ethereum private key | Yes |
| `SENDGRID_API_KEY` | SendGrid API key for emails | Yes |
| `FROM_EMAIL` | Email address for outgoing emails | Yes |
| `BASE_URL` | Base URL for API endpoints | Yes |

### Frontend Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_BASE` | Backend API base URL | No (auto-detected) |

## Development

### Running locally

1. **Start backend:**

```bash
cd backend
cp .env.example .env
# Fill in your environment variables
bun install
bun run dev
```

2. **Start frontend:**

```bash
cd frontend
cp .env.example .env  # Optional
bun install
bun run dev
```

### Building for production

```bash
# Backend
cd backend
bun run build

# Frontend
cd frontend
bun run build
```

## API Endpoints

- `POST /api/items` - Create new clipboard item
- `GET /api/items/:id` - Retrieve clipboard item
- `DELETE /api/items/:id` - Delete clipboard item
- `GET /api/health` - Health check

## Security Considerations

- **Never commit `.env` files** - They contain sensitive credentials
- **Use strong private keys** - Generate secure Ethereum private keys
- **Rotate API keys regularly** - Especially SendGrid keys
- **Use HTTPS in production** - Configure SSL certificates
- **Firewall configuration** - Limit access to necessary ports only

## Troubleshooting

### Common Issues

1. **Calendar not displaying properly**: Clear browser cache and reload
2. **API connection issues**: Check backend logs and network connectivity
3. **Email not sending**: Verify SendGrid API key and domain configuration
4. **Blockchain connection issues**: Check Arkiv network status and RPC endpoints

### Logs

```bash
# View backend logs
docker compose logs copypal-backend

# View frontend logs
docker compose logs copypal-frontend

# Follow logs in real-time
docker compose logs -f
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section above
- Review logs for error details