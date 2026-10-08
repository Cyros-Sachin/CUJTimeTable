import { Router } from 'express';
import { pool } from '../db.js';
import { authRouter } from './auth.js';
import { metaRouter } from './meta.js';
import { dashboardRouter } from './dashboard.js';
import { entriesRouter } from './entries.js';
import { datesheetsRouter } from './datesheets.js';
import { consolidatedRouter } from './consolidated.js';
import { adminRouter } from './admin.js';

export const apiRouter = Router();

apiRouter.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/meta', metaRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/entries', entriesRouter);
apiRouter.use('/datesheets', datesheetsRouter);
apiRouter.use('/consolidated', consolidatedRouter);
apiRouter.use('/admin', adminRouter);
