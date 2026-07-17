# Use the lightweight Node.js 20 image
FROM node:20-alpine

# Create and set the app directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your backend code (Secret files will map automatically at runtime)
COPY . .

# Expose the port your Express app listens on
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]