# Stage 1: Build the React SPA
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine
# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf
# Add custom config
COPY nginx.conf /etc/nginx/conf.d/darkhold.conf
# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8099
CMD ["nginx", "-g", "daemon off;"]
