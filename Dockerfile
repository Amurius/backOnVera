# syntax = docker/dockerfile:1

# Adjust BUN_VERSION as desired
ARG BUN_VERSION=1.1.24
FROM oven/bun:${BUN_VERSION}-slim AS base

LABEL fly_launch_runtime="Bun"

# Bun app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

# Install node modules
COPY bun.lock package.json ./
RUN bun install --ci

# Copy application code
COPY . .


# Final stage for app image
FROM base

# Install packages needed for deployment (Python 3.11 for yt-dlp compatibility)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y ffmpeg curl ca-certificates software-properties-common && \
    echo "deb http://deb.debian.org/debian bookworm main" > /etc/apt/sources.list.d/bookworm.list && \
    apt-get update -qq && \
    apt-get install --no-install-recommends -y python3.11 && \
    ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives /etc/apt/sources.list.d/bookworm.list

# Copy built application
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "bun", "run", "start" ]
