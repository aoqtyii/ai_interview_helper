FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
RUN npm install

FROM deps AS build
COPY tsconfig.base.json ./
COPY prisma prisma
COPY apps/api apps/api
RUN npm run prisma:generate
RUN npm --workspace @aih/api run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/prisma prisma
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
EXPOSE 4000
CMD ["npm", "--workspace", "@aih/api", "run", "start"]
