const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

let appDir = __dirname;
if (process.pkg) {
  appDir = path.dirname(process.execPath);
}
const dataDir = path.join(appDir, 'data');

function ensurePapersDir() {
  const papersDir = path.join(dataDir, 'papers');
  if (!fs.existsSync(papersDir)) {
    fs.mkdirSync(papersDir, { recursive: true });
  }
  return papersDir;
}

function downloadWithRedirect(arxivId, redirectCount = 0) {
  return new Promise((resolve) => {
    resolve.called = false;
    
    if (redirectCount > 5) {
      resolve.called = true;
      resolve({ success: false, error: '重定向次数过多' });
      return;
    }

    const papersDir = ensurePapersDir();
    const savePath = path.join(papersDir, `${arxivId}.pdf`);
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    
    console.log('[Download] Starting download:', arxivId);
    console.log('[Download] URL:', pdfUrl);
    console.log('[Download] Save path:', savePath);
    
    const file = fs.createWriteStream(savePath);
    
    const client = pdfUrl.startsWith('https') ? https : http;
    
    const req = client.get(pdfUrl, (response) => {
      console.log('[Download] Status:', response.statusCode);
      
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log('[Download] Redirect to:', response.headers.location);
        file.close();
        if (fs.existsSync(savePath)) {
          fs.unlinkSync(savePath);
        }
        
        const redirectUrl = response.headers.location;
        if (redirectUrl.startsWith('http')) {
          downloadWithRedirect(arxivId, redirectCount + 1).then(resolve);
        } else {
          const newArxivId = redirectUrl.replace(/^\//, '').replace(/\.pdf$/, '');
          downloadWithRedirect(newArxivId, redirectCount + 1).then(resolve);
        }
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(savePath)) {
          fs.unlinkSync(savePath);
        }
        resolve.called = true;
        resolve({ success: false, error: `HTTP ${response.statusCode}` });
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(savePath);
        console.log('[Download] Success! Size:', stats.size);
        resolve.called = true;
        resolve({ 
          success: true, 
          filePath: savePath,
          fileName: `${arxivId}.pdf`,
          size: stats.size,
          message: `论文已成功下载保存到本地！\n\n📁 文件路径: ${savePath}\n📄 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
        });
      });
    });
    
    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(savePath)) {
        fs.unlinkSync(savePath);
      }
      console.log('[Download] Error:', err.message);
      resolve.called = true;
      resolve({ success: false, error: err.message });
    });
    
    setTimeout(() => {
      if (!resolve.called) {
        req.destroy();
        file.close();
        if (fs.existsSync(savePath)) {
          fs.unlinkSync(savePath);
        }
        resolve.called = true;
        resolve({ success: false, error: '下载超时（超过30秒）' });
      }
    }, 30000);
  });
}

function downloadArxivPDF(arxivId) {
  const cleanId = arxivId.replace(/^\d+\.\d+$/, v => v);
  return downloadWithRedirect(cleanId);
}

module.exports = { downloadArxivPDF };
