#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

/**
 * Cleanup script for VPS optimization
 * Removes unnecessary files, logs, and cache
 */

const CLEANUP_PATHS = [
    // Auth session files (keep only latest)
    './auth_info_baileys',
    // Temporary files
    './temp',
    './tmp',
    // Old logs (keep only recent)
    './logs',
    // Node modules cache
    './node_modules/.cache',
    // NPM cache
    '~/.npm/_cacache',
    // Backup files older than 7 days
    './backups'
];

const LOG_RETENTION_DAYS = 7;
const BACKUP_RETENTION_DAYS = 7;

async function cleanupLogs() {
    console.log(chalk.blue('🧹 Cleaning up old logs...'));
    
    const logsDir = path.join(__dirname, 'logs');
    if (!await fs.pathExists(logsDir)) {
        console.log(chalk.yellow('📁 Logs directory not found, skipping...'));
        return;
    }
    
    const files = await fs.readdir(logsDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);
    
    let deletedCount = 0;
    let freedSpace = 0;
    
    for (const file of files) {
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
            freedSpace += stats.size;
            await fs.remove(filePath);
            deletedCount++;
            console.log(chalk.gray(`  ❌ Deleted: ${file}`));
        }
    }
    
    console.log(chalk.green(`✅ Deleted ${deletedCount} old log files, freed ${Math.round(freedSpace / 1024 / 1024)}MB`));
}

async function cleanupBackups() {
    console.log(chalk.blue('🧹 Cleaning up old backups...'));
    
    const backupsDir = path.join(__dirname, 'backups');
    if (!await fs.pathExists(backupsDir)) {
        console.log(chalk.yellow('📁 Backups directory not found, skipping...'));
        return;
    }
    
    const files = await fs.readdir(backupsDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - BACKUP_RETENTION_DAYS);
    
    let deletedCount = 0;
    let freedSpace = 0;
    
    for (const file of files) {
        const filePath = path.join(backupsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
            freedSpace += stats.size;
            await fs.remove(filePath);
            deletedCount++;
            console.log(chalk.gray(`  ❌ Deleted: ${file}`));
        }
    }
    
    console.log(chalk.green(`✅ Deleted ${deletedCount} old backup files, freed ${Math.round(freedSpace / 1024 / 1024)}MB`));
}

async function cleanupAuthSessions() {
    console.log(chalk.blue('🧹 Cleaning up old auth sessions...'));
    
    const authDir = path.join(__dirname, 'auth_info_baileys');
    if (!await fs.pathExists(authDir)) {
        console.log(chalk.yellow('📁 Auth directory not found, skipping...'));
        return;
    }
    
    // Keep only essential session files
    const files = await fs.readdir(authDir);
    const keepFiles = ['creds.json', 'app-state-sync-version.json'];
    
    let deletedCount = 0;
    let freedSpace = 0;
    
    for (const file of files) {
        if (!keepFiles.includes(file) && !file.startsWith('session-')) {
            const filePath = path.join(authDir, file);
            const stats = await fs.stat(filePath);
            freedSpace += stats.size;
            await fs.remove(filePath);
            deletedCount++;
            console.log(chalk.gray(`  ❌ Deleted: ${file}`));
        }
    }
    
    console.log(chalk.green(`✅ Deleted ${deletedCount} unnecessary auth files, freed ${Math.round(freedSpace / 1024)}KB`));
}

async function cleanupTempFiles() {
    console.log(chalk.blue('🧹 Cleaning up temporary files...'));
    
    const tempDirs = ['./temp', './tmp'];
    let totalDeleted = 0;
    let totalFreed = 0;
    
    for (const tempDir of tempDirs) {
        const fullPath = path.join(__dirname, tempDir);
        if (await fs.pathExists(fullPath)) {
            const stats = await fs.stat(fullPath);
            totalFreed += stats.size;
            await fs.remove(fullPath);
            totalDeleted++;
            console.log(chalk.gray(`  ❌ Deleted directory: ${tempDir}`));
        }
    }
    
    console.log(chalk.green(`✅ Deleted ${totalDeleted} temp directories, freed ${Math.round(totalFreed / 1024)}KB`));
}

async function showMemoryUsage() {
    console.log(chalk.blue('💾 Current memory usage:'));
    const memUsage = process.memoryUsage();
    console.log(chalk.cyan(`  Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`));
    console.log(chalk.cyan(`  Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`));
    console.log(chalk.cyan(`  External: ${Math.round(memUsage.external / 1024 / 1024)}MB`));
    console.log(chalk.cyan(`  RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`));
}

async function main() {
    console.log(chalk.bold.blue('🚀 Starting VPS Cleanup Process...'));
    console.log(chalk.gray('='.repeat(50)));
    
    try {
        await showMemoryUsage();
        console.log('');
        
        await cleanupLogs();
        await cleanupBackups();
        await cleanupAuthSessions();
        await cleanupTempFiles();
        
        // Force garbage collection if available
        if (global.gc) {
            console.log(chalk.blue('🗑️ Running garbage collection...'));
            global.gc();
            console.log(chalk.green('✅ Garbage collection completed'));
        }
        
        console.log('');
        await showMemoryUsage();
        
        console.log(chalk.gray('=' .repeat(50)));
        console.log(chalk.bold.green('✅ Cleanup completed successfully!'));
        
    } catch (error) {
        console.error(chalk.red('❌ Cleanup failed:'), error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };