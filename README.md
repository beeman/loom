# Loom

An autonomous development engine that weaves GitHub issues into production-ready code via AI agents.

## Overview

Loom automates the software development lifecycle by monitoring GitHub repositories for tasks, dispatching autonomous agents to implement changes, and managing the resulting pull requests. It aims to reduce human involvement to high-level architectural decisions and final code reviews.

## Tech Stack

* **Runtime:** [Bun](https://bun.sh/)
* **Language:** TypeScript
* **Monorepo Management:** [Turbo repo](https://turbo.build/)
* **Orchestration:** Node.js/TypeScript-based agent logic

## Workflow

1. **Ingestion:** Loom monitors GitHub for new issues or specific labels.
2. **Dispatch:** An agent is assigned to the issue, cloning the repo and analyzing the codebase.
3. **Execution:** The agent develops the feature or fix within a sandbox environment.
4. **Verification:** Automated tests are executed to validate the implementation.
5. **Submission:** Loom opens a Pull Request for human or automated review.
6. **Iteration:** Comments on the PR are fed back to the agent for refinement.

## Project Structure

```
.
├── apps/               # Application source code
│   ├── api/           # Backend API
│   └── web/           # Frontend Web Application
├── packages/          # Shared packages
│   ├── config-*/      # Shared configuration (TypeScript, Vite, etc.)
│   ├── env/           # Environment variable handling
│   ├── shell/         # Shared shell/layout components
│   └── ui/            # Shared UI component library
└── turbo/             # Turbo configuration and generators
```

## Getting Started

## Requirements

- [FNM](https://github.com/Schniz/fnm) or [NVM](https://github.com/nvm-sh/nvm)
- [Node.js](https://nodejs.org) (v20+)
- [Bun](https://bun.sh) (v1.0+)

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd <your-project-name>

# Install dependencies
bun install
```

## Usage

### Development

Start the development server for all apps:

```bash
bun dev
```

Or filter for a specific app:

```bash
bun dev --filter=web
```

### Build

Build all packages and apps:

```bash
bun run build
```

### Code Quality

Run linting and formatting checks:

```bash
# Lint
bun lint

# Fix linting issues
bun lint:fix

# Type check
bun check-types
```

## Contributing

Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
