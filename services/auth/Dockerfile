FROM node:20-slim

WORKDIR /app

COPY services/auth/package.json ./
RUN npm install --production=false

COPY services/auth/ ./

EXPOSE 3100

CMD ["npm", "start"]
