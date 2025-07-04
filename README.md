# Video Call Application

A production-ready video call web application built with React.js, Node.js, and LiveKit for high-performance, scalable video conferencing.

## Features

### Core Video Features
- **High-Quality Video/Audio**: Optimized for HD video and crystal-clear audio
- **Group Calls**: Support for multiple participants in a single room
- **Simulcast**: Multi-resolution streams for optimal bandwidth usage
- **Adaptive Bitrate (ABR)**: Automatic quality adjustment based on network conditions
- **Screen Sharing**: Share your screen with participants
- **Audio/Video Track Management**: Individual control over audio/video streams

### Production Features
- **Horizontal Scalability**: Load balancing across multiple server instances
- **Authentication & Authorization**: JWT-based user authentication with role-based permissions
- **Room Management**: Create, join, and manage video rooms
- **Server-side Recording**: Record video calls for later playback
- **Real-time Notifications**: WebSocket-based notifications
- **Rate Limiting**: API protection against abuse
- **Security**: Helmet.js, CORS, input validation
- **Logging**: Comprehensive logging with Winston
- **Error Handling**: Graceful error handling and recovery

### Technical Features
- **WebRTC**: Peer-to-peer communication for low latency
- **Redis Caching**: Session and room data caching
- **MongoDB**: Persistent data storage
- **AWS Integration**: File uploads and cloud storage
- **Email Notifications**: Invitation and reminder emails
- **Responsive Design**: Works on desktop, tablet, and mobile

## Prerequisites

- Node.js 18+ 
- MongoDB 5+
- Redis 6+
- LiveKit Server (self-hosted or cloud)
- AWS Account (for file storage)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd video-call-app
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Database Setup**
   ```bash
   # Start MongoDB and Redis
   # Update MONGODB_URI and REDIS_URL in .env
   ```

5. **LiveKit Setup**
   - Deploy LiveKit server or use LiveKit Cloud
   - Update LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in .env

## Development

```bash
# Start development servers
npm run dev

# Start only backend
npm run server:dev

# Start only frontend
npm run client:dev
```

## Production Deployment

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d
```

### Manual Deployment
```bash
# Build frontend
npm run build

# Start production server
npm start
```

### Load Balancer Setup
- Use Nginx or HAProxy for load balancing
- Configure sticky sessions for WebSocket connections
- Set up SSL/TLS termination

## API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout

### Room Endpoints
- `POST /api/rooms` - Create a new room
- `GET /api/rooms` - List user's rooms
- `GET /api/rooms/:id` - Get room details
- `PUT /api/rooms/:id` - Update room settings
- `DELETE /api/rooms/:id` - Delete room
- `POST /api/rooms/:id/join` - Join room
- `POST /api/rooms/:id/leave` - Leave room

### LiveKit Token Endpoints
- `POST /api/tokens/room` - Generate room access token
- `POST /api/tokens/recording` - Generate recording token

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │    │   Node.js API   │    │   LiveKit       │
│                 │◄──►│   Server        │◄──►│   Server        │
│   - Video UI    │    │   - Auth        │    │   - WebRTC      │
│   - Controls    │    │   - Rooms       │    │   - Recording   │
│   - Chat        │    │   - Tokens      │    │   - Load Bal.   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   MongoDB       │
                       │   - Users       │
                       │   - Rooms       │
                       │   - Sessions    │
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Redis         │
                       │   - Cache       │
                       │   - Sessions    │
                       │   - Rate Limit  │
                       └─────────────────┘
```

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on API endpoints
- Input validation and sanitization
- CORS configuration
- Helmet.js security headers
- HTTPS enforcement in production

## Performance Optimizations

- Redis caching for frequently accessed data
- Database connection pooling
- Image optimization and compression
- CDN integration for static assets
- Load balancing for horizontal scaling
- WebSocket connection pooling

## Monitoring and Logging

- Winston logging with multiple transports
- Error tracking and monitoring
- Performance metrics collection
- Health check endpoints
- Real-time system monitoring

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Contact the development team 