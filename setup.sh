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

# Prompt for Claude API configuration
echo "Claude API Configuration"
echo "------------------------"
echo ""
echo "Choose how to connect to Claude:"
echo "  1) Anthropic API key (direct) - from https://console.anthropic.com"
echo "  2) AWS Bedrock - use Claude through your AWS account"
echo ""
read -p "Enter your choice (1 or 2, or press Enter to skip): " claude_choice

if [ "$claude_choice" = "1" ]; then
    read -p "Enter your Anthropic API key: " anthropic_key
    if [ ! -z "$anthropic_key" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$anthropic_key/" .env
        else
            sed -i "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$anthropic_key/" .env
        fi
        echo "Anthropic API key saved to .env"
    fi
elif [ "$claude_choice" = "2" ]; then
    echo ""
    echo "AWS Bedrock Configuration"
    echo "Make sure Claude models are enabled in your AWS Bedrock console."
    echo ""
    read -p "Enter your AWS region (default: us-east-1): " aws_region
    aws_region=${aws_region:-us-east-1}

    echo ""
    echo "Authentication method:"
    echo "  1) AWS access keys (ACCESS_KEY_ID + SECRET_ACCESS_KEY)"
    echo "  2) AWS profile name"
    echo ""
    read -p "Enter your choice (1 or 2): " auth_choice

    # Enable Bedrock in .env
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/# CLAUDE_CODE_USE_BEDROCK=1/CLAUDE_CODE_USE_BEDROCK=1/" .env
        sed -i '' "s/# AWS_REGION=.*/AWS_REGION=$aws_region/" .env
    else
        sed -i "s/# CLAUDE_CODE_USE_BEDROCK=1/CLAUDE_CODE_USE_BEDROCK=1/" .env
        sed -i "s/# AWS_REGION=.*/AWS_REGION=$aws_region/" .env
    fi

    if [ "$auth_choice" = "1" ]; then
        read -p "Enter your AWS Access Key ID: " aws_key
        read -p "Enter your AWS Secret Access Key: " aws_secret
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/# AWS_ACCESS_KEY_ID=.*/AWS_ACCESS_KEY_ID=$aws_key/" .env
            sed -i '' "s/# AWS_SECRET_ACCESS_KEY=.*/AWS_SECRET_ACCESS_KEY=$aws_secret/" .env
        else
            sed -i "s/# AWS_ACCESS_KEY_ID=.*/AWS_ACCESS_KEY_ID=$aws_key/" .env
            sed -i "s/# AWS_SECRET_ACCESS_KEY=.*/AWS_SECRET_ACCESS_KEY=$aws_secret/" .env
        fi
        echo "AWS Bedrock credentials saved to .env"
    elif [ "$auth_choice" = "2" ]; then
        read -p "Enter your AWS profile name: " aws_profile
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/# AWS_PROFILE=.*/AWS_PROFILE=$aws_profile/" .env
        else
            sed -i "s/# AWS_PROFILE=.*/AWS_PROFILE=$aws_profile/" .env
        fi
        echo "AWS Bedrock profile saved to .env"
    fi
else
    echo "Skipped Claude API configuration. Please edit .env manually."
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
npm install
cd server && npm install && cd ..
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
echo "2. Start the backend server:"
echo "   cd server && npm start"
echo ""
echo "3. In a new terminal, start the Electron app:"
echo "   npm start"
echo ""
echo "For more info, check out:"
echo "   - Composio Dashboard: https://platform.composio.dev"
echo "   - Composio Docs: https://docs.composio.dev"
echo "   - Claude Agent SDK: https://docs.anthropic.com/en/docs/claude-agent-sdk"
echo ""
echo "Need help? Open an issue on GitHub!"
echo ""
