FROM --platform=linux/amd64 ghcr.io/puppeteer/puppeteer:21.11.0

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV DEBUG='puppeteer-cluster:*'

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code to the container
COPY . .

# Expose the port that your application will run on
EXPOSE 3000

# Command to start your application
CMD ["node", "app.js"]
