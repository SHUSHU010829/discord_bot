FROM node:22-slim

WORKDIR /app

# 先複製 package.json 以利 docker layer cache
COPY package.json ./

RUN npm install --omit=dev

COPY . .

CMD ["node", "src/index.js"]
