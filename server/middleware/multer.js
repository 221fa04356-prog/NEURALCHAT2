const multer = require('multer');
const cloudinaryStoragePkg = require('multer-storage-cloudinary');
const CloudinaryStorage = cloudinaryStoragePkg.CloudinaryStorage || cloudinaryStoragePkg;
const { cloudinary } = require('../config/cloudinary');

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        const originalName = file?.originalname || `voice-${Date.now()}`;
        return {
            folder: 'voice_messages',
            resource_type: 'video', // Cloudinary treats audio uploads under "video"
            public_id: `${Date.now()}-${originalName.replace(/[^\w.-]/g, '_')}`,
            use_filename: true,
            unique_filename: true,
            overwrite: false,
            allowed_formats: ['mp3', 'wav', 'm4a', 'ogg', 'opus', 'webm', 'aac', 'mp4']
        };
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }
});

module.exports = upload;
