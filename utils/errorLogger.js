const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const moment = require('moment');

// Create logs directory if not exists
const logsDir = path.join(__dirname, '..', 'logs');
fs.ensureDirSync(logsDir);

class ErrorLogger {
    constructor() {
        this.errorLogFile = path.join(logsDir, 'error.log');
        this.sessionLogFile = path.join(logsDir, 'session.log');
        this.maxLogSize = 5 * 1024 * 1024; // 5MB
        this.maxLogFiles = 5;
    }

    // Log errors to file
    logError(error, context = '') {
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const errorMessage = `[${timestamp}] ERROR ${context}: ${error.message || error}\n${error.stack || ''}\n\n`;
        
        try {
            // Rotate log if too large
            this.rotateLogIfNeeded(this.errorLogFile);
            
            // Append to error log
            fs.appendFileSync(this.errorLogFile, errorMessage);
            
            // Only show critical errors in console
            if (this.isCriticalError(error)) {
                console.log(chalk.red('❌ Critical Error:'), error.message);
                console.log(chalk.gray('📝 Full error logged to:'), this.errorLogFile);
            }
        } catch (logError) {
            console.error('Failed to log error:', logError);
        }
    }

    // Log session info (but suppress verbose output)
    logSession(message, level = 'info') {
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;
        
        try {
            // Only log to file, not console
            this.rotateLogIfNeeded(this.sessionLogFile);
            fs.appendFileSync(this.sessionLogFile, logMessage);
        } catch (error) {
            // Silently fail to avoid spam
        }
    }

    // Check if error is critical and should be shown
    isCriticalError(error) {
        const criticalKeywords = [
            'ECONNREFUSED',
            'ENOTFOUND',
            'TIMEOUT',
            'Authentication',
            'Database',
            'Permission denied'
        ];
        
        const errorString = (error.message || error.toString()).toLowerCase();
        return criticalKeywords.some(keyword => 
            errorString.includes(keyword.toLowerCase())
        );
    }

    // Rotate log files when they get too large
    rotateLogIfNeeded(logFile) {
        try {
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                if (stats.size > this.maxLogSize) {
                    // Rotate logs
                    for (let i = this.maxLogFiles - 1; i > 0; i--) {
                        const oldFile = `${logFile}.${i}`;
                        const newFile = `${logFile}.${i + 1}`;
                        if (fs.existsSync(oldFile)) {
                            fs.moveSync(oldFile, newFile);
                        }
                    }
                    fs.moveSync(logFile, `${logFile}.1`);
                }
            }
        } catch (error) {
            // Silently fail rotation
        }
    }

    // Get recent errors for debugging
    getRecentErrors(lines = 50) {
        try {
            if (fs.existsSync(this.errorLogFile)) {
                const content = fs.readFileSync(this.errorLogFile, 'utf8');
                const allLines = content.split('\n');
                return allLines.slice(-lines).join('\n');
            }
            return 'No errors logged yet.';
        } catch (error) {
            return 'Failed to read error log.';
        }
    }

    // Clear old logs
    clearOldLogs() {
        try {
            const files = fs.readdirSync(logsDir);
            files.forEach(file => {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                const daysDiff = moment().diff(moment(stats.mtime), 'days');
                
                // Delete logs older than 7 days
                if (daysDiff > 7) {
                    fs.unlinkSync(filePath);
                }
            });
        } catch (error) {
            // Silently fail cleanup
        }
    }
}

const errorLogger = new ErrorLogger();

// Clean old logs on startup
errorLogger.clearOldLogs();

module.exports = errorLogger;