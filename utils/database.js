const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const DB_PATH = process.env.DB_PATH || './database/';

// Memory optimization: Cache for frequently accessed databases
const dbCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 10; // Maximum cached databases

// Ensure database directory exists
fs.ensureDirSync(DB_PATH);

/**
 * Load database from JSON file
 * @param {string} filename - Database filename
 * @returns {Object} Database object
 */
async function loadDatabase(filename) {
    try {
        const filePath = path.join(DB_PATH, filename);
        
        if (!await fs.pathExists(filePath)) {
            console.log(chalk.yellow(`⚠️ Database file ${filename} not found, creating new one...`));
            
            // Create default database structure based on filename
            const defaultData = getDefaultDatabaseStructure(filename);
            await saveDatabase(filename, defaultData);
            return defaultData;
        }
        
        const data = await fs.readJson(filePath);
        console.log(chalk.green(`✅ Loaded database: ${filename}`));
        return data;
        
    } catch (error) {
        console.error(chalk.red(`❌ Error loading database ${filename}:`), error);
        
        // Return default structure on error
        return getDefaultDatabaseStructure(filename);
    }
}

/**
 * Save database to JSON file
 * @param {string} filename - Database filename
 * @param {Object} data - Data to save
 */
async function saveDatabase(filename, data) {
    try {
        const filePath = path.join(DB_PATH, filename);
        
        // Create backup before saving
        if (await fs.pathExists(filePath)) {
            const backupPath = path.join(DB_PATH, 'backups', `${filename}.backup.${Date.now()}`);
            await fs.ensureDir(path.dirname(backupPath));
            await fs.copy(filePath, backupPath);
            
            // Keep only last 5 backups
            await cleanupBackups(filename);
        }
        
        // Add metadata
        data.metadata = {
            lastUpdated: new Date().toISOString(),
            version: '1.0.0',
            backupCount: await getBackupCount(filename)
        };
        
        await fs.writeJson(filePath, data, { spaces: 2 });
        // Only log important saves to reduce verbose output
        if (filename === 'finance.json' || Math.random() < 0.1) {
            console.log(chalk.green(`💾 Saved database: ${filename}`));
        }
        
    } catch (error) {
        console.error(chalk.red(`❌ Error saving database ${filename}:`), error);
        throw error;
    }
}

/**
 * Get default database structure based on filename
 * @param {string} filename - Database filename
 * @returns {Object} Default structure
 */
function getDefaultDatabaseStructure(filename) {
    switch (filename) {
        case 'finance.json':
            return {
                transactions: [],
                balance: 0,
                summary: {
                    totalIncome: 0,
                    totalExpense: 0,
                    transactionCount: 0,
                    lastUpdated: null
                },
                categories: {
                    income: ['Donasi', 'Iuran', 'Sponsor', 'Penjualan', 'Lainnya'],
                    expense: ['Konsumsi', 'Transport', 'ATK', 'Dokumentasi', 'Acara', 'Lainnya']
                },
                settings: {
                    currency: 'IDR',
                    dateFormat: 'DD/MM/YYYY',
                    autoBackup: true,
                    notifications: true
                }
            };
            
        case 'users.json':
            return {
                users: {},
                admins: [],
                settings: {
                    autoRegister: true,
                    defaultRole: 'member',
                    maxUsers: 1000
                },
                stats: {
                    totalUsers: 0,
                    activeUsers: 0,
                    lastUpdated: null
                }
            };
            
        case 'groups.json':
            return {
                groups: {},
                settings: {
                    autoJoin: false,
                    welcomeMessage: true,
                    antiSpam: true,
                    maxGroups: 50
                },
                stats: {
                    totalGroups: 0,
                    activeGroups: 0,
                    lastUpdated: null
                }
            };
            
        case 'files.json':
            return {
                files: [],
                folders: [],
                driveFiles: [],
                settings: {
                    maxFileSize: '50MB',
                    allowedTypes: ['image', 'video', 'audio', 'document', 'archive'],
                    autoUploadToDrive: true,
                    compressionEnabled: true
                },
                stats: {
                    totalFiles: 0,
                    totalSize: 0,
                    driveUsage: 0,
                    lastCleanup: null
                },
                quota: {
                    used: 0,
                    limit: 15000000000,
                    remaining: 15000000000
                }
            };
            
        default:
            return {
                data: {},
                settings: {},
                stats: {
                    created: new Date().toISOString(),
                    lastUpdated: null
                }
            };
    }
}

/**
 * Clean up old backups, keep only last 5
 * @param {string} filename - Database filename
 */
async function cleanupBackups(filename) {
    try {
        const backupDir = path.join(DB_PATH, 'backups');
        if (!await fs.pathExists(backupDir)) return;
        
        const files = await fs.readdir(backupDir);
        const backupFiles = files
            .filter(file => file.startsWith(`${filename}.backup.`))
            .map(file => ({
                name: file,
                path: path.join(backupDir, file),
                time: parseInt(file.split('.').pop())
            }))
            .sort((a, b) => b.time - a.time);
        
        // Remove old backups (keep only 5 most recent)
        for (let i = 5; i < backupFiles.length; i++) {
            await fs.remove(backupFiles[i].path);
        }
        
    } catch (error) {
        console.error(chalk.yellow('⚠️ Error cleaning up backups:'), error);
    }
}

/**
 * Get backup count for a database file
 * @param {string} filename - Database filename
 * @returns {number} Backup count
 */
async function getBackupCount(filename) {
    try {
        const backupDir = path.join(DB_PATH, 'backups');
        if (!await fs.pathExists(backupDir)) return 0;
        
        const files = await fs.readdir(backupDir);
        return files.filter(file => file.startsWith(`${filename}.backup.`)).length;
        
    } catch (error) {
        return 0;
    }
}

/**
 * Create full backup of all databases
 */
async function createFullBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(DB_PATH, 'full-backups', timestamp);
        
        await fs.ensureDir(backupDir);
        
        // Copy all database files
        const dbFiles = await fs.readdir(DB_PATH);
        for (const file of dbFiles) {
            if (file.endsWith('.json')) {
                const sourcePath = path.join(DB_PATH, file);
                const destPath = path.join(backupDir, file);
                await fs.copy(sourcePath, destPath);
            }
        }
        
        console.log(chalk.green(`✅ Full backup created: ${timestamp}`));
        return backupDir;
        
    } catch (error) {
        console.error(chalk.red('❌ Error creating full backup:'), error);
        throw error;
    }
}

/**
 * Restore database from backup
 * @param {string} filename - Database filename
 * @param {string} backupPath - Backup file path
 */
async function restoreFromBackup(filename, backupPath) {
    try {
        if (!await fs.pathExists(backupPath)) {
            throw new Error('Backup file not found');
        }
        
        const targetPath = path.join(DB_PATH, filename);
        await fs.copy(backupPath, targetPath);
        
        console.log(chalk.green(`✅ Restored ${filename} from backup`));
        
    } catch (error) {
        console.error(chalk.red(`❌ Error restoring ${filename}:`), error);
        throw error;
    }
}

/**
 * Get database statistics
 * @param {string} filename - Database filename
 * @returns {Object} Database stats
 */
async function getDatabaseStats(filename) {
    try {
        const filePath = path.join(DB_PATH, filename);
        if (!await fs.pathExists(filePath)) {
            return { exists: false };
        }
        
        const stats = await fs.stat(filePath);
        const data = await fs.readJson(filePath);
        
        return {
            exists: true,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            records: getRecordCount(data),
            backups: await getBackupCount(filename)
        };
        
    } catch (error) {
        console.error(chalk.red(`❌ Error getting stats for ${filename}:`), error);
        return { exists: false, error: error.message };
    }
}

/**
 * Get record count from database object
 * @param {Object} data - Database data
 * @returns {number} Record count
 */
function getRecordCount(data) {
    let count = 0;
    
    if (data.transactions) count += data.transactions.length;
    if (data.users) count += Object.keys(data.users).length;
    if (data.groups) count += Object.keys(data.groups).length;
    if (data.files) count += data.files.length;
    
    return count;
}

/**
 * Validate database integrity
 * @param {string} filename - Database filename
 * @returns {Object} Validation result
 */
async function validateDatabase(filename) {
    try {
        const data = await loadDatabase(filename);
        const errors = [];
        const warnings = [];
        
        // Basic structure validation
        if (!data || typeof data !== 'object') {
            errors.push('Invalid database structure');
        }
        
        // Specific validations based on database type
        switch (filename) {
            case 'finance.json':
                if (!Array.isArray(data.transactions)) {
                    errors.push('Transactions must be an array');
                }
                if (typeof data.balance !== 'number') {
                    errors.push('Balance must be a number');
                }
                break;
                
            case 'users.json':
                if (!data.users || typeof data.users !== 'object') {
                    errors.push('Users must be an object');
                }
                break;
                
            case 'groups.json':
                if (!data.groups || typeof data.groups !== 'object') {
                    errors.push('Groups must be an object');
                }
                break;
                
            case 'files.json':
                if (!Array.isArray(data.files)) {
                    errors.push('Files must be an array');
                }
                break;
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
        
    } catch (error) {
        return {
            valid: false,
            errors: [error.message],
            warnings: []
        };
    }
}

module.exports = {
    loadDatabase,
    saveDatabase,
    createFullBackup,
    restoreFromBackup,
    getDatabaseStats,
    validateDatabase,
    cleanupBackups
};