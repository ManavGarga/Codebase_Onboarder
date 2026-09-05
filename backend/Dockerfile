FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV PORT=4000
ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "dist/server.js"]
