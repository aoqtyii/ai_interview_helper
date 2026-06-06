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

AI calls fail fast when `AI_API_KEY` is empty. Set `AI_MOCK_MODE=true` only when you deliberately want local deterministic AI responses for development.

`npx.cmd prisma validate` requires `DATABASE_URL` in the current shell or `.env`. Docker services use the container database URL from `docker-compose.yml`.
