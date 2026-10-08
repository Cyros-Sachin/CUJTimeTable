const bool = (v, def) => (v === undefined || v === '' ? def : v === 'true' || v === '1');

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'cuj_datesheet',
    user: process.env.DB_USER || 'cuj_app',
    password: process.env.DB_PASSWORD || '',
  },
  jwtSecret: process.env.JWT_SECRET || '',
  admin: {
    name: process.env.ADMIN_NAME || 'Exam Cell Incharge',
    email: process.env.ADMIN_EMAIL || 'examcell@cuj.local',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe#12345',
  },
  seedDemoUsers: bool(process.env.SEED_DEMO_USERS, true),
  refSeqStart: Number(process.env.REF_SEQ_START || 3000),
  storageDir: process.env.STORAGE_DIR || '/app/storage',
};
