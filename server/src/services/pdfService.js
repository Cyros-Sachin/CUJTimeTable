import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { pool } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { datesheetHtml } from '../templates/datesheetHtml.js';
import { overallHtml } from '../templates/overallHtml.js';

let browserPromise = null;
let inFlight = 0;
const MAX_CONCURRENT_PAGES = 2;
const waitQueue = [];

async function acquireSlot() {
  if (inFlight < MAX_CONCURRENT_PAGES) {
    inFlight += 1;
    return;
  }
  await new Promise((resolve) => waitQueue.push(resolve));
  inFlight += 1;
}

function releaseSlot() {
  inFlight -= 1;
  const next = waitQueue.shift();
  if (next) next();
}

async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    userDataDir: '/tmp/chromium-profile',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const browser = await browserPromise;
  browser.on('disconnected', () => {
    logger.warn('Chromium disconnected, will relaunch on next request');
    browserPromise = null;
  });
  return browser;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close().catch(() => {});
  browserPromise = null;
}

async function renderPdf(html, pdfOptions) {
  await acquireSlot();
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf(pdfOptions);
  } finally {
    if (page) await page.close().catch(() => {});
    releaseSlot();
  }
}

async function fileToDataUri(relativePath) {
  if (!relativePath) return null;
  try {
    const fullPath = path.join(config.storageDir, relativePath);
    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

async function getSettings() {
  const [rows] = await pool.query('SELECT k, v FROM settings');
  const map = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  return {
    controllerTitle: map.controller_title || 'Controller of Examinations',
    controllerName: map.controller_name || '',
    logoPath: map.logo_path || '',
    signaturePath: map.signature_path || '',
  };
}

export async function renderDatesheetPdf({ refNo, issuedOn, cycleTitle, cycleMonthYear, departmentName, programName, semester, examType, rows }) {
  const settings = await getSettings();
  const [logoDataUri, signatureDataUri] = await Promise.all([
    fileToDataUri(settings.logoPath),
    fileToDataUri(settings.signaturePath),
  ]);

  const html = datesheetHtml({
    logoDataUri, signatureDataUri, controllerName: settings.controllerName, controllerTitle: settings.controllerTitle,
    refNo, issuedOn, cycleTitle, cycleMonthYear, departmentName, programName, semester, examType, rows,
  });

  return renderPdf(html, {
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', right: '18mm', bottom: '16mm', left: '18mm' },
  });
}

export async function renderOverallPdf({ cycleTitle, cycleMonthYear, rows }) {
  const html = overallHtml({ cycleTitle, cycleMonthYear, rows });
  return renderPdf(html, {
    format: 'A4',
    landscape: true,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:9px; width:100%; text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    margin: { top: '12mm', right: '12mm', bottom: '16mm', left: '12mm' },
  });
}
