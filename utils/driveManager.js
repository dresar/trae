const { google } = require('googleapis');
const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
require('dotenv').config();

// Google Drive configuration
const GOOGLE_DRIVE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const GOOGLE_DRIVE_REDIRECT_URI = process.env.GOOGLE_DRIVE_REDIRECT_URI;
const GOOGLE_DRIVE_REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

class DriveManager {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            GOOGLE_DRIVE_CLIENT_ID,
            GOOGLE_DRIVE_CLIENT_SECRET,
            GOOGLE_DRIVE_REDIRECT_URI
        );
        
        this.oauth2Client.setCredentials({
            refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN
        });
        
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        this.kknFolderId = null;
        this.folderStructure = {
            'Dokumen': null,
            'Gambar': null,
            'Video': null,
            'Audio': null,
            'Arsip': null,
            'Lainnya': null
        };
    }

    // Get current time in WIB (UTC+7)
    getWIBTime() {
        const now = new Date();
        const wibTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        return {
            full: wibTime.toISOString().replace('T', ' ').substring(0, 19) + ' WIB',
            date: wibTime.toISOString().substring(0, 10),
            time: wibTime.toISOString().substring(11, 19),
            timestamp: wibTime.getTime()
        };
    }

    // Determine file type based on extension
    getFileType(filename) {
        const ext = path.extname(filename).toLowerCase();
        
        const typeMap = {
            // Dokumen
            '.pdf': 'Dokumen',
            '.doc': 'Dokumen',
            '.docx': 'Dokumen',
            '.txt': 'Dokumen',
            '.rtf': 'Dokumen',
            '.odt': 'Dokumen',
            '.xls': 'Dokumen',
            '.xlsx': 'Dokumen',
            '.ppt': 'Dokumen',
            '.pptx': 'Dokumen',
            
            // Gambar
            '.jpg': 'Gambar',
            '.jpeg': 'Gambar',
            '.png': 'Gambar',
            '.gif': 'Gambar',
            '.bmp': 'Gambar',
            '.webp': 'Gambar',
            '.svg': 'Gambar',
            
            // Video
            '.mp4': 'Video',
            '.avi': 'Video',
            '.mkv': 'Video',
            '.mov': 'Video',
            '.wmv': 'Video',
            '.flv': 'Video',
            '.webm': 'Video',
            
            // Audio
            '.mp3': 'Audio',
            '.wav': 'Audio',
            '.flac': 'Audio',
            '.aac': 'Audio',
            '.ogg': 'Audio',
            '.m4a': 'Audio',
            
            // Arsip
            '.zip': 'Arsip',
            '.rar': 'Arsip',
            '.7z': 'Arsip',
            '.tar': 'Arsip',
            '.gz': 'Arsip'
        };
        
        return typeMap[ext] || 'Lainnya';
    }

    // Initialize KKN folder structure
    async initializeKKNFolder() {
        try {
            // Check if KKN folder already exists
            const existingFolder = await this.findFolder('Bot-KKN-Files');
            
            if (existingFolder) {
                this.kknFolderId = existingFolder.id;
                console.log(`📁 KKN folder found: ${existingFolder.name} (${this.kknFolderId})`);
            } else {
                // Create main KKN folder
                const kknFolder = await this.createFolder('Bot-KKN-Files', null);
                this.kknFolderId = kknFolder.id;
                console.log(`📁 KKN folder created: ${kknFolder.name} (${this.kknFolderId})`);
            }
            
            // Create/verify subfolders
            for (const folderName of Object.keys(this.folderStructure)) {
                const existingSubfolder = await this.findFolder(folderName, this.kknFolderId);
                
                if (existingSubfolder) {
                    this.folderStructure[folderName] = existingSubfolder.id;
                    console.log(`📂 Subfolder found: ${folderName} (${existingSubfolder.id})`);
                } else {
                    const subfolder = await this.createFolder(folderName, this.kknFolderId);
                    this.folderStructure[folderName] = subfolder.id;
                    console.log(`📂 Subfolder created: ${folderName} (${subfolder.id})`);
                }
            }
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize KKN folder:', error.message);
            return false;
        }
    }

    // Find folder by name
    async findFolder(name, parentId = null) {
        try {
            let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            if (parentId) {
                query += ` and '${parentId}' in parents`;
            }
            
            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id, name)'
            });
            
            return response.data.files.length > 0 ? response.data.files[0] : null;
        } catch (error) {
            console.error('❌ Error finding folder:', error.message);
            return null;
        }
    }

    // Create folder
    async createFolder(name, parentId = null) {
        try {
            const folderMetadata = {
                name: name,
                mimeType: 'application/vnd.google-apps.folder'
            };
            
            if (parentId) {
                folderMetadata.parents = [parentId];
            }
            
            const folder = await this.drive.files.create({
                resource: folderMetadata,
                fields: 'id, name'
            });
            
            return folder.data;
        } catch (error) {
            console.error('❌ Error creating folder:', error.message);
            throw error;
        }
    }

    // Upload file to appropriate folder
    async uploadFile(filePath, originalName = null, customName = null) {
        try {
            if (!await fs.pathExists(filePath)) {
                throw new Error('File tidak ditemukan');
            }
            
            // Initialize folder structure if not done
            if (!this.kknFolderId) {
                await this.initializeKKNFolder();
            }
            
            const fileName = originalName || path.basename(filePath);
            const fileType = this.getFileType(fileName);
            const targetFolderId = this.folderStructure[fileType];
            const wibTime = this.getWIBTime();
            
            // Generate final filename
            const finalName = customName || `${path.parse(fileName).name}_${wibTime.timestamp}${path.extname(fileName)}`;
            
            const fileMetadata = {
                name: finalName,
                parents: [targetFolderId],
                description: `Uploaded: ${wibTime.full}\nOriginal: ${fileName}\nType: ${fileType}`
            };
            
            const media = {
                mimeType: mime.lookup(fileName) || 'application/octet-stream',
                body: fs.createReadStream(filePath)
            };
            
            const file = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, name, size, createdTime, parents'
            });
            
            const fileInfo = {
                id: file.data.id,
                name: file.data.name,
                originalName: fileName,
                size: parseInt(file.data.size),
                type: fileType,
                uploadTime: wibTime.full,
                folderId: targetFolderId,
                downloadUrl: `https://drive.google.com/file/d/${file.data.id}/view`
            };
            
            console.log(`✅ File uploaded: ${finalName} (${fileInfo.size} bytes) to ${fileType}`);
            return fileInfo;
            
        } catch (error) {
            console.error('❌ Upload failed:', error.message);
            throw error;
        }
    }

    // Download file from Drive
    async downloadFile(fileId, downloadPath) {
        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, { responseType: 'stream' });
            
            // Ensure download directory exists
            await fs.ensureDir(path.dirname(downloadPath));
            
            const writeStream = fs.createWriteStream(downloadPath);
            response.data.pipe(writeStream);
            
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });
            
            const stats = await fs.stat(downloadPath);
            console.log(`✅ File downloaded: ${downloadPath} (${stats.size} bytes)`);
            
            return {
                path: downloadPath,
                size: stats.size
            };
            
        } catch (error) {
            console.error('❌ Download failed:', error.message);
            throw error;
        }
    }

    // Get file info
    async getFileInfo(fileId) {
        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                fields: 'id, name, size, createdTime, modifiedTime, mimeType, parents, description'
            });
            
            const file = response.data;
            const wibTime = this.getWIBTime();
            
            return {
                id: file.id,
                name: file.name,
                size: parseInt(file.size) || 0,
                mimeType: file.mimeType,
                created: new Date(file.createdTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
                modified: new Date(file.modifiedTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
                description: file.description || '',
                downloadUrl: `https://drive.google.com/file/d/${file.id}/view`,
                directDownload: `https://drive.google.com/uc?id=${file.id}`
            };
            
        } catch (error) {
            console.error('❌ Failed to get file info:', error.message);
            throw error;
        }
    }

    // List files in KKN folder by type
    async listFiles(fileType = null, limit = 20) {
        try {
            if (!this.kknFolderId) {
                await this.initializeKKNFolder();
            }
            
            let folderId;
            if (fileType && this.folderStructure[fileType]) {
                folderId = this.folderStructure[fileType];
            } else {
                folderId = this.kknFolderId;
            }
            
            const response = await this.drive.files.list({
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id, name, size, createdTime, mimeType)',
                orderBy: 'createdTime desc',
                pageSize: limit
            });
            
            const files = response.data.files.map(file => ({
                id: file.id,
                name: file.name,
                size: parseInt(file.size) || 0,
                type: this.getFileType(file.name),
                created: new Date(file.createdTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
                downloadUrl: `https://drive.google.com/file/d/${file.id}/view`
            }));
            
            return files;
            
        } catch (error) {
            console.error('❌ Failed to list files:', error.message);
            throw error;
        }
    }

    // Delete file
    async deleteFile(fileId) {
        try {
            await this.drive.files.delete({
                fileId: fileId
            });
            
            console.log(`✅ File deleted: ${fileId}`);
            return true;
            
        } catch (error) {
            console.error('❌ Delete failed:', error.message);
            throw error;
        }
    }

    // Rename file
    async renameFile(fileId, newName) {
        try {
            const response = await this.drive.files.update({
                fileId: fileId,
                resource: {
                    name: newName
                },
                fields: 'id, name'
            });
            
            console.log(`✅ File renamed: ${response.data.name}`);
            return response.data;
            
        } catch (error) {
            console.error('❌ Rename failed:', error.message);
            throw error;
        }
    }

    // Search files
    async searchFiles(query, fileType = null) {
        try {
            if (!this.kknFolderId) {
                await this.initializeKKNFolder();
            }
            
            let searchQuery = `name contains '${query}' and trashed=false`;
            
            if (fileType && this.folderStructure[fileType]) {
                searchQuery += ` and '${this.folderStructure[fileType]}' in parents`;
            } else {
                searchQuery += ` and '${this.kknFolderId}' in parents`;
            }
            
            const response = await this.drive.files.list({
                q: searchQuery,
                fields: 'files(id, name, size, createdTime, parents)',
                orderBy: 'createdTime desc'
            });
            
            const files = response.data.files.map(file => ({
                id: file.id,
                name: file.name,
                size: parseInt(file.size) || 0,
                type: this.getFileType(file.name),
                created: new Date(file.createdTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
                downloadUrl: `https://drive.google.com/file/d/${file.id}/view`
            }));
            
            return files;
            
        } catch (error) {
            console.error('❌ Search failed:', error.message);
            throw error;
        }
    }

    // Get storage info
    async getStorageInfo() {
        try {
            const response = await this.drive.about.get({
                fields: 'storageQuota, user'
            });
            
            const quota = response.data.storageQuota;
            const user = response.data.user;
            
            return {
                user: {
                    name: user.displayName,
                    email: user.emailAddress
                },
                storage: {
                    limit: parseInt(quota.limit),
                    usage: parseInt(quota.usage),
                    usageInDrive: parseInt(quota.usageInDrive),
                    available: parseInt(quota.limit) - parseInt(quota.usage)
                }
            };
            
        } catch (error) {
            console.error('❌ Failed to get storage info:', error.message);
            throw error;
        }
    }

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = DriveManager;