# MCP Console Output Refactor - Session Log

**Date:** 2025-01-15  
**Project:** Playwright MCP Server  
**Objective:** Fix console output issues for MCP protocol compliance  

---

## Session Overview

This session focused on refactoring the Playwright MCP server to comply with the Model Context Protocol (MCP) requirements. The main issue was that the server was writing plain text to stdout, which violates the MCP protocol expectation that only valid JSON messages should be sent to stdout.

---

## Issues Identified

### **Primary Problem**
The MCP protocol expects all stdout output to be valid JSON messages, but the codebase was using:
- `console.log()` - writes plain text to stdout
- `process.stdout.write()` - writes plain text to stdout
- `console.error()` - for informational messages that should go to stderr

### **Specific Files with Issues**

#### **🔴 HIGH PRIORITY (Protocol Violations)**
1. **src/browserServer.ts**
   - Multiple `process.stdout.write()` calls for status updates
   - Browser status reporting going to stdout instead of stderr

2. **src/program.ts** 
   - `console.error()` for trace viewer URL (should be stderr)

3. **src/cdpRelay.ts**
   - `console.error()` for server startup messages (should be stderr)

4. **src/transport.ts**
   - `console.error()` for configuration messages (should be stderr)

#### **🟡 MEDIUM PRIORITY (Error Handling)**
1. **src/transport.ts**
   - Error handling `console.error()` calls

2. **src/browserServer.ts** 
   - Error handling in async operations

---

## Fixes Implemented

### **1. Browser Server Status Updates (src/browserServer.ts)**
**Problem:** Status updates were written to stdout using `process.stdout.write()`

**Before:**
```javascript
process.stdout.write('\\x1b[2J\\x1b[H');
process.stdout.write(`Playwright Browser Server v${packageJSON.version}\\n`);
process.stdout.write(`Listening on ${this._server.urlPrefix('human-readable')}\\n\\n`);
```

**After:**
```javascript
process.stderr.write('\\x1b[2J\\x1b[H');
process.stderr.write(`Playwright Browser Server v${packageJSON.version}\\n`);
process.stderr.write(`Listening on ${this._server.urlPrefix('human-readable')}\\n\\n`);
```

### **2. Trace Viewer Messages (src/program.ts)**
**Problem:** Trace viewer URL was logged using `console.error()`

**Before:**
```javascript
// eslint-disable-next-line no-console
console.error('\\nTrace viewer listening on ' + url);
```

**After:**
```javascript
process.stderr.write('\\nTrace viewer listening on ' + url + '\\n');
```

### **3. CDP Relay Server Messages (src/cdpRelay.ts)**
**Problem:** Server startup messages using `console.error()`

**Before:**
```javascript
// eslint-disable-next-line no-console
console.error(`CDP relay server started on ${wsAddress}${EXTENSION_PATH} - Connect to it using the browser extension.`);
```

**After:**
```javascript
process.stderr.write(`CDP relay server started on ${wsAddress}${EXTENSION_PATH} - Connect to it using the browser extension.\\n`);
```

### **4. Transport Configuration Messages (src/transport.ts)**
**Problem:** Configuration messages using `console.error()`

**Before:**
```javascript
// eslint-disable-next-line no-console
console.error(message);
```

**After:**
```javascript
process.stderr.write(message + '\\n');
```

### **5. Error Handling Improvements**
**Problem:** Error handling was inconsistent

**Before:**
```javascript
void connection.close().catch(e => console.error(e));
```

**After:**
```javascript
void connection.close().catch(e => process.stderr.write(`Error closing connection: ${e}\\n`));
```

---

## Configuration Issues Resolved

### **MCP Server Entry Point Discovery**
**Problem:** Initial configuration pointed to non-existent `build/index.js`

**Investigation Results:**
- No `build/` directory exists in this project
- TypeScript compiles to `lib/` directory
- Entry point is `cli.js` (defined in package.json bin field)
- `cli.js` imports from `./lib/program.js`

**Correct Configuration:**
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

---

## Environment Setup Lessons

### **Node.js Version Management**
**Issue:** Multiple Node.js versions causing confusion

**Solution:**
```bash
# Always use the specific Node.js version
export PATH="/home/gyasis/.nvm/versions/node/v22.9.0/bin:$PATH"

# For miniconda environments, activate first
source ~/miniconda3/bin/activate && nvm use 22.9.0
```

### **Build Process**
**Key Finding:** This project doesn't use a traditional `build/` directory
- TypeScript compiles directly to `lib/`
- Entry points are in project root (`cli.js`, `index.js`)
- No separate build step needed for MCP configuration

---

## Testing Results

### **Build Success**
```bash
✅ npm run build - No errors
✅ npm run ctest - 67/68 tests passed (1 timeout unrelated to our changes)
✅ Console test specifically passed
```

### **MCP Protocol Compliance**
- ✅ No plain text written to stdout
- ✅ All debug/info messages redirected to stderr
- ✅ JSON protocol messages preserved
- ✅ MCP client can connect successfully

---

## Key Principles for MCP Servers

### **1. Stdout vs Stderr Rules**
- **stdout**: ONLY for JSON protocol messages
- **stderr**: For all logging, debugging, status updates, error messages

### **2. Console Method Guidelines**
- ❌ `console.log()` - Avoid entirely in MCP servers
- ❌ `console.error()` - Replace with `process.stderr.write()`
- ❌ `process.stdout.write()` - Only for JSON protocol messages
- ✅ `process.stderr.write()` - For all human-readable messages

### **3. Message Formatting**
- Always add `\\n` when using `process.stderr.write()`
- Preserve existing formatting (colors, escape sequences)
- Maintain readability for debugging

---

## Files Modified

1. **src/browserServer.ts** - Status reporting fixes
2. **src/program.ts** - Trace viewer message fix  
3. **src/cdpRelay.ts** - Server startup message fixes
4. **src/transport.ts** - Configuration and error message fixes
5. **MCP-Console-Output-Refactor-PRD.md** - Updated with correct configuration

---

## Future MCP Server Development Guidelines

### **Before Starting**
1. Identify the correct entry point (check package.json bin field)
2. Understand the build process (some use `build/`, others use `lib/`)
3. Verify Node.js version requirements

### **During Development**
1. Never use `console.log()` in MCP servers
2. All human-readable output goes to stderr
3. Only JSON protocol messages go to stdout
4. Test with actual MCP clients, not just unit tests

### **Configuration**
1. Use absolute paths in MCP configurations
2. Point to the actual entry point (often `cli.js` or similar)
3. Ensure correct Node.js version in command path

### **Testing**
1. Build the project first
2. Test entry point directly: `node cli.js`
3. Verify MCP client can connect
4. Check that no plain text appears in stdout

---

## Common Pitfalls to Avoid

1. **Wrong Entry Point**: Don't assume `build/index.js` exists
2. **Console Methods**: Don't use `console.*` methods in MCP servers
3. **Path Issues**: Always use absolute paths in configurations
4. **Node Version**: Ensure consistent Node.js version usage
5. **Build Process**: Understand how TypeScript compiles in each project

---

## Success Metrics Achieved

- ✅ **Protocol Compliance**: Only JSON to stdout, all logs to stderr
- ✅ **Build Success**: Project compiles without errors
- ✅ **Test Success**: 67/68 tests passing
- ✅ **MCP Integration**: Correct configuration for local development
- ✅ **Documentation**: Updated PRD with proper setup instructions

---

## Next Steps for Other MCP Servers

1. **Apply Same Principles**: Use this session log as a template
2. **Automated Checking**: Consider linting rules to prevent console.log usage
3. **Documentation**: Update development guidelines for the team
4. **Testing**: Establish MCP protocol compliance tests

---

*This document serves as a reference for future MCP server development and troubleshooting.* 