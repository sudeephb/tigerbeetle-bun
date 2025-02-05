FROM node:latest
WORKDIR /app
COPY package.json package.json
# COPY bun.lockb bun.lockb
RUN npm install
COPY . .
EXPOSE 3000
ENTRYPOINT ["node", "index.tsx"]
