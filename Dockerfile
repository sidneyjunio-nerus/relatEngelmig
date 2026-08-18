FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
EXPOSE 3210

CMD ["npm", "start"]
