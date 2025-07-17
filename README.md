# StyleSeeker Import Worker

A dedicated API worker for handling product imports in the StyleSeeker ecosystem. This service is designed to run long-running import tasks that would timeout on platforms like Vercel.

## Overview

This worker handles product data imports from various e-commerce platforms (currently supporting Shopcada) and processes them into vector embeddings for semantic search. It's separated from the main StyleSeeker application to handle compute-intensive tasks without timeout constraints.

## Features

- **Product Import**: Fetches product data from external APIs
- **Vector Processing**: Generates embeddings for product descriptions and images
- **Database Storage**: Stores processed data for the main StyleSeeker application
- **API Key Authentication**: Secure access via app-specific API keys

## API Endpoint

### Import Products

```
POST /api/apps/[appId]/import
Authorization: Bearer YOUR_API_KEY
```

**Example:**

```bash
curl -X POST "https://your-worker.com/api/apps/123/import" \
  -H "Authorization: Bearer your_api_key_here"
```

## Environment Variables

Required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `PINECONE_API_KEY` - Pinecone vector database API key
- `OPENROUTER_API_KEY` - OpenRouter API key for AI processing

## Deployment

This worker is optimized for deployment on platforms that support longer execution times than Vercel (such as AWS EC2, Railway, etc.).

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```
