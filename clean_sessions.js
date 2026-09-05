const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

/**
 * Script untuk membersihkan session yang corrupt dan menyebabkan Bad MAC error
 */

async function cleanCorruptSessions() {
    console.log(chalk.yellow('🧹 Membersihkan session yang corrupt...'));
    
    const authDir = path.join(__dirname, 'auth');
    
    if (!fs.existsSync(authDir)) {
        console.log(chalk.red('❌ Folder auth tidak ditemukan!'));
        return;
    }
    
    try {
        const files = await fs.readdir(authDir);
        let cleanedCount = 0;
        let totalFiles = 0;
        
        for (const file of files) {
            if (file.startsWith('session-') && file.endsWith('.json')) {
                totalFiles++;
                const filePath = path.join(authDir, file);
                
                try {
                    // Coba baca file session
                    const sessionData = await fs.readJson(filePath);
                    
                    // Periksa apakah session memiliki struktur yang valid
                    if (!sessionData._sessions || Object.keys(sessionData._sessions).length === 0) {
                        console.log(chalk.yellow(`🗑️  Menghapus session kosong: ${file}`));
                        await fs.remove(filePath);
                        cleanedCount++;
                        continue;
                    }
                    
                    // Periksa setiap session dalam file
                    let hasValidSession = false;
                    for (const [sessionId, session] of Object.entries(sessionData._sessions)) {
                        if (session.registrationId && session.currentRatchet && session.indexInfo) {
                            hasValidSession = true;
                            break;
                        }
                    }
                    
                    if (!hasValidSession) {
                        console.log(chalk.yellow(`🗑️  Menghapus session invalid: ${file}`));
                        await fs.remove(filePath);
                        cleanedCount++;
                    }
                    
                } catch (error) {
                    console.log(chalk.yellow(`🗑️  Menghapus session corrupt: ${file}`));
                    await fs.remove(filePath);
                    cleanedCount++;
                }
            }
        }
        
        console.log(chalk.green(`✅ Pembersihan selesai!`));
        console.log(chalk.blue(`📊 Total file session: ${totalFiles}`));
        console.log(chalk.blue(`🧹 File yang dibersihkan: ${cleanedCount}`));
        console.log(chalk.blue(`✨ File yang tersisa: ${totalFiles - cleanedCount}`));
        
        if (cleanedCount > 0) {
            console.log(chalk.yellow('⚠️  Restart bot untuk menerapkan perubahan'));
        }
        
    } catch (error) {
        console.error(chalk.red('❌ Error saat membersihkan session:'), error);
    }
}

// Fungsi untuk backup session sebelum membersihkan
async function backupSessions() {
    console.log(chalk.yellow('💾 Membuat backup session...'));
    
    const authDir = path.join(__dirname, 'auth');
    const backupDir = path.join(__dirname, 'auth_backup_' + Date.now());
    
    try {
        await fs.copy(authDir, backupDir);
        console.log(chalk.green(`✅ Backup dibuat di: ${backupDir}`));
        return backupDir;
    } catch (error) {
        console.error(chalk.red('❌ Error saat membuat backup:'), error);
        return null;
    }
}

// Fungsi utama
async function main() {
    console.log(chalk.cyan('🔧 Session Cleaner Tool'));
    console.log(chalk.cyan('========================'));
    
    // Buat backup terlebih dahulu
    const backupPath = await backupSessions();
    
    if (backupPath) {
        // Lanjutkan pembersihan
        await cleanCorruptSessions();
    } else {
        console.log(chalk.red('❌ Pembersihan dibatalkan karena backup gagal'));
    }
}

// Jalankan jika dipanggil langsung
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { cleanCorruptSessions, backupSessions };