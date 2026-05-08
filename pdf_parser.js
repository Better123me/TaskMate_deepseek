const fs = require('fs');
const path = require('path');

let appDir = __dirname;
if (process.pkg) {
  appDir = path.dirname(process.execPath);
}
const dataDir = path.join(appDir, 'data');
const papersDir = path.join(dataDir, 'papers');
const analysisDir = path.join(dataDir, 'analysis');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function ensurePapersDir() {
  if (!fs.existsSync(papersDir)) {
    fs.mkdirSync(papersDir, { recursive: true });
  }
  return papersDir;
}

function ensureAnalysisDir() {
  if (!fs.existsSync(analysisDir)) {
    fs.mkdirSync(analysisDir, { recursive: true });
  }
}

function getAllPapers() {
  const papersFile = path.join(dataDir, 'papers.json');
  try {
    if (fs.existsSync(papersFile)) {
      return JSON.parse(fs.readFileSync(papersFile, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading papers:', e);
  }
  return [];
}

function findPaperByTitle(title) {
  const papers = getAllPapers();
  return papers.find(p => p.title && p.title.toLowerCase().includes(title.toLowerCase()));
}

function getPaperPDFPath(arxivId) {
  return path.join(papersDir, `${arxivId}.pdf`);
}

async function parsePDF(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve({ success: false, error: 'PDF文件不存在' });
      return;
    }

    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      pdfParse(dataBuffer).then(data => {
        resolve({
          success: true,
          text: data.text,
          numPages: data.numpages,
          info: data.info
        });
      }).catch(err => {
        resolve({ success: false, error: err.message });
      });
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

function savePaperAnalysis(arxivId, paperInfo) {
  ensureAnalysisDir();
  const analysisFile = path.join(analysisDir, `${arxivId}.json`);
  try {
    fs.writeFileSync(analysisFile, JSON.stringify(paperInfo, null, 2), 'utf-8');
    return { success: true, filePath: analysisFile };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  ensurePapersDir,
  getAllPapers,
  findPaperByTitle,
  getPaperPDFPath,
  parsePDF,
  savePaperAnalysis
};
