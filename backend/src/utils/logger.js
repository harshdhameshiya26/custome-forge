// ANSI color escape sequences
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const getTimestamp = () => new Date().toISOString();

/**
 * Log a success message in green with ISO timestamp
 * @param {string} message
 */
export const logSuccess = (message) => {
  console.log(`${GREEN}${getTimestamp()} ${message}${RESET}`);
};

/**
 * Log an error message in red with ISO timestamp
 * @param {string} message
 */
export const logError = (message) => {
  console.error(`${RED}${getTimestamp()} ${message}${RESET}`);
};

/**
 * Log a warning message in yellow with ISO timestamp
 * @param {string} message
 */
export const logWarn = (message) => {
  console.warn(`${YELLOW}${getTimestamp()} ${message}${RESET}`);
};

export default {
  success: logSuccess,
  error: logError,
  warn: logWarn,
};
