const { formatCurrency, formatDate, generateId, parseAmount } = require('../utils/helpers');
const { saveDatabase } = require('../utils/database');
const moment = require('moment');

/**
 * Handle finance commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 * @param {Object} financeDB - Finance database
 */
async function handleFinanceCommand(sock, msg, command, args, financeDB) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const senderNumber = sender.replace('@s.whatsapp.net', '');
    
    try {
        switch (command) {
            case 'masuk':
                await handleIncome(sock, from, args, financeDB, senderNumber);
                break;
                
            case 'keluar':
                await handleExpense(sock, from, args, financeDB, senderNumber);
                break;
                
            case 'saldo':
                await handleBalance(sock, from, financeDB);
                break;
                
            case 'laporan':
                await handleReport(sock, from, args, financeDB);
                break;
                
            case 'kategori':
                await handleCategories(sock, from, args, financeDB);
                break;
                
            case 'backup':
                await handleBackup(sock, from, financeDB);
                break;
                
            case 'restore':
                await handleRestore(sock, from, args, financeDB);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '❓ *Command keuangan tidak ditemukan*\n\nGunakan: masuk, keluar, saldo, laporan, kategori, backup, restore'
                });
        }
    } catch (error) {
        console.error('Error in finance command:', error);
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan*\n\nSilakan coba lagi atau hubungi admin.'
        });
    }
}

/**
 * Handle income transaction
 */
async function handleIncome(sock, from, args, financeDB, senderNumber) {
    if (args.length < 2) {
        await sock.sendMessage(from, {
            text: '❌ *Format salah*\n\n📝 *Cara penggunaan:*\n`.masuk [jumlah] [keterangan]`\n\n📋 *Contoh:*\n`.masuk 50000 Iuran anggota`\n`.masuk 100000 Donasi dari alumni`'
        });
        return;
    }
    
    const amount = parseAmount(args[0]);
    const description = args.slice(1).join(' ');
    
    if (amount <= 0) {
        await sock.sendMessage(from, {
            text: '❌ *Jumlah tidak valid*\n\nMasukkan jumlah yang benar (angka positif).'
        });
        return;
    }
    
    if (!description.trim()) {
        await sock.sendMessage(from, {
            text: '❌ *Keterangan diperlukan*\n\nSilakan tambahkan keterangan untuk transaksi ini.'
        });
        return;
    }
    
    // Create transaction
    const transaction = {
        id: generateId(),
        type: 'income',
        amount: amount,
        description: description.trim(),
        category: 'Lainnya',
        date: new Date().toISOString(),
        addedBy: senderNumber,
        addedAt: new Date().toISOString()
    };
    
    // Update database
    financeDB.transactions.push(transaction);
    financeDB.balance += amount;
    financeDB.summary.totalIncome += amount;
    financeDB.summary.transactionCount++;
    financeDB.summary.lastUpdated = new Date().toISOString();
    
    await saveDatabase('finance.json', financeDB);
    
    // Send confirmation
    const message = `✅ *Pemasukan Berhasil Dicatat*\n\n` +
        `💰 *Jumlah:* ${formatCurrency(amount)}\n` +
        `📝 *Keterangan:* ${description}\n` +
        `📅 *Tanggal:* ${formatDate(transaction.date)}\n` +
        `🆔 *ID Transaksi:* ${transaction.id}\n\n` +
        `💳 *Saldo Saat Ini:* ${formatCurrency(financeDB.balance)}`;
    
    await sock.sendMessage(from, { text: message });
}

/**
 * Handle expense transaction
 */
async function handleExpense(sock, from, args, financeDB, senderNumber) {
    if (args.length < 2) {
        await sock.sendMessage(from, {
            text: '❌ *Format salah*\n\n📝 *Cara penggunaan:*\n`.keluar [jumlah] [keterangan]`\n\n📋 *Contoh:*\n`.keluar 25000 Beli konsumsi rapat`\n`.keluar 15000 Transport ke lokasi`'
        });
        return;
    }
    
    const amount = parseAmount(args[0]);
    const description = args.slice(1).join(' ');
    
    if (amount <= 0) {
        await sock.sendMessage(from, {
            text: '❌ *Jumlah tidak valid*\n\nMasukkan jumlah yang benar (angka positif).'
        });
        return;
    }
    
    if (!description.trim()) {
        await sock.sendMessage(from, {
            text: '❌ *Keterangan diperlukan*\n\nSilakan tambahkan keterangan untuk transaksi ini.'
        });
        return;
    }
    
    // Check if balance is sufficient
    if (financeDB.balance < amount) {
        await sock.sendMessage(from, {
            text: `❌ *Saldo Tidak Mencukupi*\n\n💳 *Saldo Saat Ini:* ${formatCurrency(financeDB.balance)}\n💰 *Jumlah Pengeluaran:* ${formatCurrency(amount)}\n📉 *Kekurangan:* ${formatCurrency(amount - financeDB.balance)}`
        });
        return;
    }
    
    // Create transaction
    const transaction = {
        id: generateId(),
        type: 'expense',
        amount: amount,
        description: description.trim(),
        category: 'Lainnya',
        date: new Date().toISOString(),
        addedBy: senderNumber,
        addedAt: new Date().toISOString()
    };
    
    // Update database
    financeDB.transactions.push(transaction);
    financeDB.balance -= amount;
    financeDB.summary.totalExpense += amount;
    financeDB.summary.transactionCount++;
    financeDB.summary.lastUpdated = new Date().toISOString();
    
    await saveDatabase('finance.json', financeDB);
    
    // Send confirmation
    const message = `✅ *Pengeluaran Berhasil Dicatat*\n\n` +
        `💸 *Jumlah:* ${formatCurrency(amount)}\n` +
        `📝 *Keterangan:* ${description}\n` +
        `📅 *Tanggal:* ${formatDate(transaction.date)}\n` +
        `🆔 *ID Transaksi:* ${transaction.id}\n\n` +
        `💳 *Saldo Saat Ini:* ${formatCurrency(financeDB.balance)}`;
    
    await sock.sendMessage(from, { text: message });
}

/**
 * Handle balance inquiry
 */
async function handleBalance(sock, from, financeDB) {
    const { balance, summary } = financeDB;
    const lastTransaction = financeDB.transactions[financeDB.transactions.length - 1];
    
    let message = `💳 *SALDO KKN*\n\n` +
        `💰 *Saldo Saat Ini:* ${formatCurrency(balance)}\n\n` +
        `📊 *RINGKASAN:*\n` +
        `📈 *Total Pemasukan:* ${formatCurrency(summary.totalIncome)}\n` +
        `📉 *Total Pengeluaran:* ${formatCurrency(summary.totalExpense)}\n` +
        `🔢 *Jumlah Transaksi:* ${summary.transactionCount}\n\n`;
    
    if (lastTransaction) {
        const typeIcon = lastTransaction.type === 'income' ? '📈' : '📉';
        const typeText = lastTransaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
        
        message += `🕐 *Transaksi Terakhir:*\n` +
            `${typeIcon} ${typeText}: ${formatCurrency(lastTransaction.amount)}\n` +
            `📝 ${lastTransaction.description}\n` +
            `📅 ${formatDate(lastTransaction.date)}`;
    }
    
    if (summary.lastUpdated) {
        message += `\n\n🔄 *Terakhir Diperbarui:* ${formatDate(summary.lastUpdated)}`;
    }
    
    await sock.sendMessage(from, { text: message });
}

/**
 * Handle transaction report
 */
async function handleReport(sock, from, args, financeDB) {
    const { transactions } = financeDB;
    
    if (transactions.length === 0) {
        await sock.sendMessage(from, {
            text: '📋 *LAPORAN KEUANGAN*\n\n❌ Belum ada transaksi yang tercatat.\n\nGunakan `.masuk` atau `.keluar` untuk menambah transaksi.'
        });
        return;
    }
    
    let filter = 'all';
    let limit = 10;
    
    // Parse arguments
    if (args.length > 0) {
        const arg = args[0].toLowerCase();
        if (['masuk', 'income', 'pemasukan'].includes(arg)) {
            filter = 'income';
        } else if (['keluar', 'expense', 'pengeluaran'].includes(arg)) {
            filter = 'expense';
        } else if (!isNaN(parseInt(arg))) {
            limit = Math.min(parseInt(arg), 50); // Max 50 transactions
        }
    }
    
    if (args.length > 1 && !isNaN(parseInt(args[1]))) {
        limit = Math.min(parseInt(args[1]), 50);
    }
    
    // Filter transactions
    let filteredTransactions = transactions;
    if (filter !== 'all') {
        filteredTransactions = transactions.filter(t => t.type === filter);
    }
    
    // Sort by date (newest first) and limit
    filteredTransactions = filteredTransactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, limit);
    
    if (filteredTransactions.length === 0) {
        await sock.sendMessage(from, {
            text: `📋 *LAPORAN KEUANGAN*\n\n❌ Tidak ada transaksi ${filter === 'income' ? 'pemasukan' : 'pengeluaran'} yang ditemukan.`
        });
        return;
    }
    
    // Generate report
    let message = `📋 *LAPORAN KEUANGAN*\n\n`;
    
    if (filter !== 'all') {
        message += `🔍 *Filter:* ${filter === 'income' ? 'Pemasukan' : 'Pengeluaran'}\n`;
    }
    
    message += `📊 *Menampilkan ${filteredTransactions.length} dari ${transactions.length} transaksi*\n\n`;
    
    filteredTransactions.forEach((transaction, index) => {
        const typeIcon = transaction.type === 'income' ? '📈' : '📉';
        const amountColor = transaction.type === 'income' ? '+' : '-';
        
        message += `${index + 1}. ${typeIcon} *${amountColor}${formatCurrency(transaction.amount)}*\n`;
        message += `   📝 ${transaction.description}\n`;
        message += `   📅 ${formatDate(transaction.date, 'DD/MM/YY HH:mm')}\n`;
        message += `   🆔 ${transaction.id}\n\n`;
    });
    
    // Add summary for filtered data
    const totalIncome = filteredTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpense = filteredTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    
    message += `📊 *RINGKASAN (Data Ditampilkan):*\n`;
    message += `📈 Pemasukan: ${formatCurrency(totalIncome)}\n`;
    message += `📉 Pengeluaran: ${formatCurrency(totalExpense)}\n`;
    message += `💰 Selisih: ${formatCurrency(totalIncome - totalExpense)}\n\n`;
    
    message += `💳 *Saldo Saat Ini:* ${formatCurrency(financeDB.balance)}`;
    
    // Split message if too long
    if (message.length > 4000) {
        const messages = splitMessage(message, 4000);
        for (const msg of messages) {
            await sock.sendMessage(from, { text: msg });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between messages
        }
    } else {
        await sock.sendMessage(from, { text: message });
    }
}

/**
 * Handle categories management
 */
async function handleCategories(sock, from, args, financeDB) {
    if (args.length === 0) {
        // Show categories
        let message = `📂 *KATEGORI KEUANGAN*\n\n`;
        
        message += `📈 *KATEGORI PEMASUKAN:*\n`;
        financeDB.categories.income.forEach((cat, index) => {
            message += `${index + 1}. ${cat}\n`;
        });
        
        message += `\n📉 *KATEGORI PENGELUARAN:*\n`;
        financeDB.categories.expense.forEach((cat, index) => {
            message += `${index + 1}. ${cat}\n`;
        });
        
        message += `\n💡 *Cara penggunaan:*\n`;
        message += `• \`.kategori add masuk [nama]\` - Tambah kategori pemasukan\n`;
         message += `• \`.kategori add keluar [nama]\` - Tambah kategori pengeluaran\n`;
         message += `• \`.kategori remove masuk [nama]\` - Hapus kategori pemasukan\n`;
         message += `• \`.kategori remove keluar [nama]\` - Hapus kategori pengeluaran`;
        
        await sock.sendMessage(from, { text: message });
        return;
    }
    
    const action = args[0].toLowerCase();
    const type = args[1]?.toLowerCase();
    const categoryName = args.slice(2).join(' ');
    
    if (!['add', 'remove'].includes(action)) {
        await sock.sendMessage(from, {
            text: '❌ *Aksi tidak valid*\n\nGunakan: `add` atau `remove`'
        });
        return;
    }
    
    if (!['masuk', 'keluar', 'income', 'expense'].includes(type)) {
        await sock.sendMessage(from, {
            text: '❌ *Tipe tidak valid*\n\nGunakan: `masuk` atau `keluar`'
        });
        return;
    }
    
    if (!categoryName.trim()) {
        await sock.sendMessage(from, {
            text: '❌ *Nama kategori diperlukan*\n\nContoh: `.kategori add masuk Sponsor Event`'
        });
        return;
    }
    
    const categoryType = ['masuk', 'income'].includes(type) ? 'income' : 'expense';
    const categoryArray = financeDB.categories[categoryType];
    
    if (action === 'add') {
        if (categoryArray.includes(categoryName)) {
            await sock.sendMessage(from, {
                text: `❌ *Kategori sudah ada*\n\nKategori "${categoryName}" sudah terdaftar.`
            });
            return;
        }
        
        categoryArray.push(categoryName);
        await saveDatabase('finance.json', financeDB);
        
        await sock.sendMessage(from, {
            text: `✅ *Kategori Ditambahkan*\n\n📂 Kategori "${categoryName}" berhasil ditambahkan ke ${categoryType === 'income' ? 'pemasukan' : 'pengeluaran'}.`
        });
        
    } else if (action === 'remove') {
        const index = categoryArray.indexOf(categoryName);
        if (index === -1) {
            await sock.sendMessage(from, {
                text: `❌ *Kategori tidak ditemukan*\n\nKategori "${categoryName}" tidak ada dalam daftar.`
            });
            return;
        }
        
        if (categoryName === 'Lainnya') {
            await sock.sendMessage(from, {
                text: '❌ *Tidak dapat menghapus*\n\nKategori "Lainnya" tidak dapat dihapus.'
            });
            return;
        }
        
        categoryArray.splice(index, 1);
        await saveDatabase('finance.json', financeDB);
        
        await sock.sendMessage(from, {
            text: `✅ *Kategori Dihapus*\n\n📂 Kategori "${categoryName}" berhasil dihapus dari ${categoryType === 'income' ? 'pemasukan' : 'pengeluaran'}.`
        });
    }
}

/**
 * Handle backup
 */
async function handleBackup(sock, from, financeDB) {
    try {
        const backupData = {
            ...financeDB,
            backupInfo: {
                createdAt: new Date().toISOString(),
                version: '1.0.0',
                totalTransactions: financeDB.transactions.length,
                balance: financeDB.balance
            }
        };
        
        const backupJson = JSON.stringify(backupData, null, 2);
        const filename = `backup-keuangan-${moment().format('YYYY-MM-DD-HH-mm')}.json`;
        
        // Send as document
        await sock.sendMessage(from, {
            document: Buffer.from(backupJson),
            fileName: filename,
            mimetype: 'application/json',
            caption: `💾 *BACKUP KEUANGAN*\n\n📅 *Tanggal:* ${formatDate(new Date())}\n🔢 *Total Transaksi:* ${financeDB.transactions.length}\n💰 *Saldo:* ${formatCurrency(financeDB.balance)}\n\n📁 *File:* ${filename}`
        });
        
    } catch (error) {
        console.error('Error creating backup:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat backup*\n\nTerjadi kesalahan saat membuat backup data keuangan.'
        });
    }
}

/**
 * Handle restore (placeholder - requires file upload handling)
 */
async function handleRestore(sock, from, args, financeDB) {
    await sock.sendMessage(from, {
        text: '🔄 *RESTORE DATA KEUANGAN*\n\n📋 *Cara restore:*\n1. Kirim file backup (.json) ke chat ini\n2. Reply file tersebut dengan `.restore confirm`\n\n⚠️ *Peringatan:*\nRestore akan mengganti semua data keuangan yang ada. Pastikan Anda sudah membuat backup terlebih dahulu.'
    });
}

/**
 * Split long message into chunks
 */
function splitMessage(message, maxLength) {
    const messages = [];
    let currentMessage = '';
    const lines = message.split('\n');
    
    for (const line of lines) {
        if ((currentMessage + line + '\n').length > maxLength) {
            if (currentMessage) {
                messages.push(currentMessage.trim());
                currentMessage = '';
            }
        }
        currentMessage += line + '\n';
    }
    
    if (currentMessage.trim()) {
        messages.push(currentMessage.trim());
    }
    
    return messages;
}

module.exports = {
    handleFinanceCommand
};