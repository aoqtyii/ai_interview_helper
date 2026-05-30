# AI-Interview-Helper

AI-Interview-Helper is an internal tool for AI job seekers. It provides AI role interview simulation, skill improvement plans, learning recommendations, and frontier AI intelligence aggregation.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: NestJS, TypeScript
- Data: PostgreSQL, pgvector, Prisma
- Jobs: Redis, BullMQ
- AI: provider adapter layer with an OpenAI-compatible default
- Deployment: Docker Compose

## Quick Start

```bash
copy .env.example .env
npm.cmd install
docker compose up -d postgres redis
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
npm.cmd run dev
```

Default seeded accounts:

- Admin: `admin@aih.local` / `admin123456`
- User: `user@aih.local` / `user123456`

## Services

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health

## Notes

If `AI_API_KEY` is empty, the backend uses deterministic local mock responses so the interview flow can be developed and tested without external model calls.
