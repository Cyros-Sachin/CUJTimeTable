import multer from 'multer';

const storage = multer.memoryStorage();

const ALLOWED_EXT = /\.(xlsx|csv)$/i;

export const uploadSingle = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXT.test(file.originalname)) {
      cb(new Error('UNSUPPORTED_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
}).single('file');

export const uploadImage = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpeg)$/.test(file.mimetype)) {
      cb(new Error('UNSUPPORTED_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});
