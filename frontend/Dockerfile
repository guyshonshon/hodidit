FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_BUILD_NUMBER=dev
ARG VITE_COMMIT_SHA=dev
ENV VITE_BUILD_NUMBER=$VITE_BUILD_NUMBER
ENV VITE_COMMIT_SHA=$VITE_COMMIT_SHA
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
