FROM node:20-alpine as build

WORKDIR /app
COPY . .
RUN yarn install --verbose

EXPOSE 3000
CMD ["node", "index.js"]

