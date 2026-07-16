# Use the lightweight Node.js 20 image
FROM node:20-alpine

# Create and set the app directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install only production dependencies for a lightweight image
RUN npm install

# Copy the rest of your backend code
COPY . .

# COPY THE FIREBASE KEY SPECIFICALLY:
# This ensures Docker explicitly grabs your key file and places it inside the container
COPY firebase-key.json ./firebase-key.json

# Expose the port your Express app listens on
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]