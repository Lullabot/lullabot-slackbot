FROM node:20-alpine as build

WORKDIR /app
COPY . .
RUN yarn install --verbose

CMD ["yarn", "start"]

