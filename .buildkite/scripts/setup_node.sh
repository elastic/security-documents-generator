#!/bin/bash
set -euo pipefail

# Install Node.js using nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" || {
  # Install nvm if not present
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
}

# Install and use Node.js version from .nvmrc
nvm install
nvm use

# Install dependencies
yarn install --frozen-lockfile
