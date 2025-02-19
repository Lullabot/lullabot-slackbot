FROM node:20.18.1-alpine3.19 as build

WORKDIR /app
COPY . .
RUN yarn install --verbose

CMD ["yarn", "start"]

