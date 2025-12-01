# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Playwright MCP Server** (`@playwright/mcp`) - a Model Context Protocol server that provides browser automation capabilities using Playwright. The server enables LLMs to interact with web pages through structured accessibility snapshots rather than pixel-based input.

## Development Commands

### Build & Development
- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode for development
- `npm run clean` - Remove built files

### Testing
- `npm run test` - Run all tests using Playwright
- `npm run ctest` - Run Chrome tests only
- `npm run ftest` - Run Firefox tests only  
- `npm run wtest` - Run WebKit tests only
- `npm run etest` - Run Chromium extension tests

### Linting & Quality
- `npm run lint` - Run ESLint and TypeScript checks (also updates README)
- `npm run update-readme` - Update README with tool documentation

### Server Operations
- `npm run run-server` - Start the standalone browser server
- `npm run npm-publish` - Full publish workflow (clean, build, test, publish)

## Architecture

### Core Components

**MCP Server Architecture:**
- `src/index.ts` - Main entry point and connection factory
- `src/connection.ts` - MCP protocol connection handling
- `src/server.ts` - Server lifecycle management
- `src/context.ts` - Browser context and tool execution coordination

**Browser Management:**
- `src/browserContextFactory.ts` - Factory for creating browser contexts
- `src/browserServer.ts` - Standalone browser server for CDP connections
- `src/config.ts` - Configuration resolution and validation

**Tool System:**
- `src/tools/` - Individual tool implementations
- `src/tools/tool.ts` - Base tool definition and types
- `src/tools.ts` - Tool registry and exports

### Key Architecture Patterns

**Dual Mode Operation:**
- **Snapshot Mode** (default): Uses accessibility snapshots for structured interaction
- **Vision Mode**: Uses screenshots for coordinate-based interaction

**Configuration System:**
- CLI options override config file options
- Config file overrides defaults
- Supports both programmatic and file-based configuration

**Browser Context Management:**
- Isolated contexts for testing sessions
- Persistent profiles for regular usage
- CDP endpoint support for external browsers

**Tool Capabilities:**
- Capability-based tool filtering (`core`, `tabs`, `pdf`, `history`, `wait`, `files`, `install`, `testing`)
- Read-only vs destructive tool classification
- Modal state handling for file uploads and dialogs

## Testing

Tests are located in `tests/` directory and use Playwright Test framework:
- Browser-specific test configurations
- Extension testing support
- Test server with SSL certificates in `tests/testserver/`

## Configuration

The server supports extensive configuration through:
- CLI arguments (see `--help` for full options)
- JSON configuration files
- Environment variables
- Programmatic configuration

Key configuration areas:
- Browser selection and launch options
- Network proxy and origin filtering
- Output directory and tracing
- Capability selection
- Vision vs snapshot modes

## Extension

The project includes a Chrome extension (`extension/`) for enhanced MCP integration with browser automation capabilities.

## Development Notes

- Source code is in `src/` (TypeScript)
- Compiled output goes to `lib/` (JavaScript)
- The project uses ES modules (`"type": "module"`)
- Browser profiles are stored in platform-specific cache directories
- Supports Docker deployment with headless Chromium

## Active Technologies
- TypeScript 5.8.2 (strict mode), Node.js 18+ + Playwright 1.53.0, @modelcontextprotocol/sdk ^1.11.0, Zod (for schema validation) (001-video-recording-controls)
- Local filesystem for video files (output directory configurable) (001-video-recording-controls)

## Recent Changes
- 001-video-recording-controls: Added TypeScript 5.8.2 (strict mode), Node.js 18+ + Playwright 1.53.0, @modelcontextprotocol/sdk ^1.11.0, Zod (for schema validation)
