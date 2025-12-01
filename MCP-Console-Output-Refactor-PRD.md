# MCP Console Output Refactor – Product Requirements Document (PRD)

## Background & Motivation
- The MCP protocol expects all stdout output to be valid JSON messages.
- Current codebase uses `console.log`, which writes plain text to stdout, violating this expectation.
- This can cause protocol errors or misinterpretation by MCP clients/servers, especially when using stdio transport.

## Objective
- Refactor the codebase to ensure that only valid JSON is written to stdout.
- All non-JSON logs, debug, or informational messages should be redirected to stderr.

---

## Requirements Breakdown (MECE)

### A. Discovery & Analysis
1. Identify all instances of `console.log` in the codebase.
2. Determine the context of each usage:
   - Is it outputting protocol (JSON) messages?
   - Is it for debugging, info, or error reporting?

### B. Refactoring Implementation
1. For all non-protocol (non-JSON) `console.log` usages:
   - Replace with `process.stderr.write`, ensuring proper formatting (add newline if needed).
2. For protocol (JSON) messages:
   - Ensure they are output to stdout, using `process.stdout.write` or equivalent.
   - Validate that no accidental plain text is sent to stdout.
3. Remove or refactor any other stdout writes that are not JSON.

### C. Testing & Validation
1. Write or update tests to:
   - Confirm only valid JSON is sent to stdout.
   - Confirm all logs/debug/info are sent to stderr.
2. Manually test with MCP clients/servers to ensure protocol compliance.
3. Check for regressions in logging and protocol communication.

### D. Documentation & Communication
1. Update developer documentation to:
   - Specify the new logging/output conventions.
   - Warn against using `console.log` for anything except JSON protocol messages (if at all).
2. Communicate changes to the team, especially for contributors.

### E. Code Review & Merge
1. Submit PR with clear description of changes.
2. Request review from relevant team members.
3. Address feedback and merge after approval.

---

## Out of Scope
- Refactoring logging libraries or introducing new logging frameworks (unless required for compliance).
- Changes to protocol message structure/content (only output method is in scope).

---

## Risks & Mitigations
- **Risk:** Accidental removal of protocol messages.
  - **Mitigation:** Careful review and testing.
- **Risk:** Missed `console.log` instances in less obvious files.
  - **Mitigation:** Use automated search tools and code review.

---

## Success Criteria
- No plain text is written to stdout; only valid JSON protocol messages.
- All logs/debug/info are written to stderr.
- MCP protocol clients/servers operate without output-related errors.

---

## How to Progress Through This Project
1. **Start with Discovery & Analysis:**
   - Search the codebase for all `console.log` usages.
   - Categorize each usage as protocol (JSON) or non-protocol (debug/info).
2. **Refactor Implementation:**
   - Replace non-protocol `console.log` with `process.stderr.write`.
   - Ensure protocol messages use `process.stdout.write` and are valid JSON.
3. **Testing & Validation:**
   - Run and update tests to confirm compliance.
   - Manually test with MCP clients/servers.
4. **Documentation & Communication:**
   - Update docs and inform the team of new conventions.
5. **Code Review & Merge:**
   - Submit PR, review, and merge after approval.

---

## Installation Instructions

To install and use this project locally, follow these steps:

1. **Clone the Repository:**
   ```bash
   git clone <your-repo-url>
   cd <your-project-directory>
   ```

2. **Install Dependencies:**
   Ensure you are using the correct Node.js version (as managed by NVM or your preferred version manager). Then run:
   ```bash
   npm install
   ```

3. **(Optional) Install Playwright MCP Locally:**
   If you previously installed Playwright MCP globally or via npm, you can now use the local version for development and testing. For example:
   ```bash
   npm install -y @playwright/mcp@latest
   ```
   Or, to use your local changes directly, you may link or reference the local package as needed for your workflow.

4. **Run the Project:**
   Use the appropriate npm scripts or commands as defined in your `package.json` to start, test, or build the project. For example:
   ```bash
   npm run start
   # or
   npm test
   ```

> **Note:** If your project requires a specific Node.js version, activate it using NVM or your environment manager before running the above commands.

---

## Using Your Local Project Version (Manual Setup Guidance)

When developing or testing, you may want to ensure you are running your **local, modified version** of this project, rather than the version fetched from npm or the web. Here are several ways to do this:

### 1. npm link (Recommended for Local Development)
This method allows you to use your local project as if it were installed from npm, but it actually points to your local code.

**Steps:**
1. In your local project directory:
   ```bash
   npm link
   ```
2. In the project where you want to use your local version:
   ```bash
   npm link <your-package-name>
   ```
   Replace `<your-package-name>` with the name in your `package.json`.

### 2. Direct Path Reference in Config
If your tool or config allows, set the command or entry point to your local CLI file.

**Example for MCP Configuration:**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "/home/gyasis/.nvm/versions/node/v22.9.0/bin/node",
      "args": ["/home/gyasis/Documents/code/playwright-mcp/cli.js"]
    }
  }
}
```

**Alternative (using shebang):**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "/home/gyasis/Documents/code/playwright-mcp/cli.js"
    }
  }
}
```

### 3. Local npm Install by Path
Install your local project into another project using a relative path:
```bash
npm install ../path/to/your/local/project
```
This copies your local code into `node_modules` of the target project.

### 4. Verifying the Local Version is Used
- Add a temporary `console.log('LOCAL VERSION')` or similar in your local code.
- Run your workflow and check the output to confirm it's using your local version.

> **Note:** This is a manual step. Choose the method that best fits your workflow. If you need to switch back to the npm/web version, simply unlink or reinstall as needed. 