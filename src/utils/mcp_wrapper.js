// Utility to wrap functions and suppress stdout output in MCP mode
let originalStdoutWrite;
let originalConsoleLog;
let mcpModeActive = false;
export function enableMCPMode() {
    if (mcpModeActive)
        return;
    mcpModeActive = true;
    // Store original functions
    originalStdoutWrite = process.stdout.write;
    originalConsoleLog = console.log;
    // Override stdout.write to only allow MCP JSON
    process.stdout.write = function (data, ...args) {
        if (typeof data === 'string') {
            const trimmed = data.trim();
            // Allow all valid JSON messages (MCP requests and responses)
            if (trimmed.startsWith('{') &&
                (trimmed.includes('"jsonrpc"') ||
                    trimmed.includes('"method"') ||
                    trimmed.includes('"result"') ||
                    trimmed.includes('"error"') ||
                    trimmed.includes('"id"'))) {
                return originalStdoutWrite.call(this, data, ...args);
            }
            // Block all other output including emojis and progress bars
            return true; // Pretend write was successful but don't output anything
        }
        // For non-string data, redirect to stderr
        return process.stderr.write(data, ...args);
    };
    // Override console.log to go to stderr
    console.log = (...args) => console.error('[LOG]', ...args);
}
export function disableMCPMode() {
    if (!mcpModeActive)
        return;
    mcpModeActive = false;
    // Restore original functions
    if (originalStdoutWrite) {
        process.stdout.write = originalStdoutWrite;
    }
    if (originalConsoleLog) {
        console.log = originalConsoleLog;
    }
}
export async function withMCPMode(fn) {
    enableMCPMode();
    try {
        const result = await fn();
        return result;
    }
    finally {
        // Keep MCP mode enabled - don't disable it
    }
}
