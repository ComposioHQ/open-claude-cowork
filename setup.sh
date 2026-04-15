#!/bin/bash

# Open Claude Cowork Setup Script
# This script helps you get started with Composio and configure the project

set -e

echo "Open Claude Cowork Setup"
echo "================================"
echo ""

# Check if Composio CLI is installed
if ! command -v composio &> /dev/null; then
    echo "Composio CLI not found. Installing..."
    echo ""
    curl -fsSL https://composio.dev/install | bash
    echo ""
    echo "Composio CLI installed successfully!"
    echo ""
    # Source the shell config to make composio available immediately
    if [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc"
    fi
else
    echo "Composio CLI already installed"
    echo ""
fi

# Check if user is already logged in
if composio whoami &> /dev/null; then
    echo "Already logged in to Composio"
    echo ""
else
    echo "Please log in to Composio (or sign up if you don't have an account)"
    echo "This will open your browser to complete authentication"
    echo ""
    read -p "Press Enter to continue..."
    composio login
    echo ""
    echo "Successfully authenticated with Composio!"
    echo ""
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo ".env file created"
    echo ""
else
    echo ".env file already exists"
    echo ""
fi

# Prompt for Anthropic API key
echo "API Key Configuration"
echo "------------------------"
echo ""
echo "You'll need an Anthropic API key from: https://console.anthropic.com"
echo ""
read -p "Enter your Anthropic API key (or press Enter to skip): " anthropic_key

if [ ! -z "$anthropic_key" ]; then
    # Update .env file with Anthropic key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$anthropic_key/" .env
    else
        sed -i "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$anthropic_key/" .env
    fi
    echo "Anthropic API key saved to .env"
else
    echo "Skipped Anthropic API key. Please add it to .env manually."
fi
echo ""

# Get Composio API key and update .env
echo "Retrieving Composio API key..."
composio_key=$(composio whoami 2>&1 | grep -o "API Key: .*" | cut -d ' ' -f 3 || echo "")

if [ ! -z "$composio_key" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/COMPOSIO_API_KEY=.*/COMPOSIO_API_KEY=$composio_key/" .env
    else
        sed -i "s/COMPOSIO_API_KEY=.*/COMPOSIO_API_KEY=$composio_key/" .env
    fi
    echo "Composio API key saved to .env"
else
    echo "Could not retrieve Composio API key automatically."
    echo "Please add it to .env manually."
fi
echo ""

# Install dependencies
echo "Installing project dependencies..."
echo ""

if ! command -v python3 &> /dev/null; then
    echo "python3 is required. Install Python 3.10+ and try again."
    exit 1
fi

if [ ! -d .venv ]; then
    echo "Creating Python virtual environment (.venv)..."
    python3 -m venv .venv
fi

echo "Installing Python packages..."
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt

echo "Installing Electron dependencies (npm)..."
npm install
echo ""
echo "Dependencies installed"
echo ""

# Final instructions
echo "================================"
echo "Setup complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Make sure your .env file has both API keys configured"
echo "2. Start the Python backend (from repo root):"
echo "   npm run server"
echo "   # or: .venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 3001"
echo ""
echo "3. In a new terminal, start the Electron app:"
echo "   npm start"
echo ""
echo "For more info, check out:"
echo "   - Composio Dashboard: https://platform.composio.dev"
echo "   - Composio Docs: https://docs.composio.dev"
echo "   - Claude Agent SDK (Python): https://platform.claude.com/docs/en/agent-sdk/python"
echo ""
echo "Need help? Open an issue on GitHub!"
echo ""
