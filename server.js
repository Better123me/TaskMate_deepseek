const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const multer = require('multer');
const { downloadArxivPDF } = require('./download_pdf');
const pdfParser = require('./pdf_parser');

let appDir = __dirname;
if (process.pkg) {
  appDir = path.dirname(process.execPath);
}
const dataDir = path.join(appDir, 'data');
const publicDir = path.join(appDir, 'public');

let lastArxivRequest = 0;
const ARXIV_MIN_INTERVAL = 5000;

let lastSemanticRequest = 0;
const SEMANTIC_MIN_INTERVAL = 5000;

const SEARCH_TIMEOUT = 10000;

function withTimeout(promise, ms, errorMsg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), ms)
    )
  ]);
}

async function searchArxiv(query, maxResults = 5) {
  return new Promise((resolve) => {
    resolve.called = false;
    const now = Date.now();
    const timeSinceLastRequest = now - lastArxivRequest;
    
    if (timeSinceLastRequest < ARXIV_MIN_INTERVAL) {
      const waitTime = ARXIV_MIN_INTERVAL - timeSinceLastRequest;
      console.log(`[ArXiv] Rate limit: waiting ${waitTime}ms before request...`);
      setTimeout(() => {
        searchArxiv(query, maxResults).then(resolve);
      }, waitTime);
      return;
    }
    
    lastArxivRequest = Date.now();
    
    const searchQuery = encodeURIComponent(`all:${query}`);
    const url = `https://export.arxiv.org/api/query?search_query=${searchQuery}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
    
    console.log('[ArXiv] Searching:', query);
    
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[ArXiv] Response length:', data.length);
        console.log('[ArXiv] Response sample:', data.slice(0, 200));
        
        if (data.includes('Rate exceeded')) {
          console.log('[ArXiv] Rate limit hit! Waiting longer...');
          setTimeout(() => {
            searchArxiv(query, maxResults).then(resolve);
          }, 10000);
          return;
        }
        
        try {
          const papers = [];
          
          const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
          const entries = data.match(entryRegex);
          
          console.log('[ArXiv] Found entries:', entries ? entries.length : 0);
          
          if (entries) {
            for (const entry of entries) {
              const getTag = (tag) => {
                const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
                return match ? match[1].trim().replace(/\n+/g, ' ') : '';
              };
              
              const getAuthors = () => {
                const authorMatches = entry.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g);
                if (!authorMatches) return [];
                return authorMatches.map(a => {
                  const m = a.match(/<name>([\s\S]*?)<\/name>/);
                  return m ? m[1].trim() : '';
                });
              };
              
              papers.push({
                title: getTag('title'),
                authors: getAuthors(),
                summary: getTag('summary'),
                published: getTag('published'),
                id: getTag('id').split('/').pop()
              });
            }
          }
          
          console.log('[ArXiv] Parsed papers:', papers.length);
          resolve({ success: true, papers, query, count: papers.length });
        } catch (e) {
          console.log('[ArXiv] Parse error:', e.message);
          resolve({ success: false, error: e.message, raw: data.slice(0, 500) });
        }
      });
    }).on('error', (e) => {
      console.log('[ArXiv] Error:', e.message);
      resolve({ success: false, error: e.message });
    });
    
    setTimeout(() => {
      req.destroy();
      if (!resolve.called) {
        resolve.called = true;
        console.log('[ArXiv] Timeout!');
        resolve({ success: false, error: '请求超时（超过10秒）' });
      }
    }, SEARCH_TIMEOUT);
  });
}

let lastCrossRefRequest = 0;
const CROSSREF_MIN_INTERVAL = 100;

function searchCrossRef(query, maxResults = 5) {
  return new Promise((resolve) => {
    resolve.called = false;
    const now = Date.now();
    const timeSinceLastRequest = now - lastCrossRefRequest;
    
    if (timeSinceLastRequest < CROSSREF_MIN_INTERVAL) {
      setTimeout(() => {
        searchCrossRef(query, maxResults).then(resolve);
      }, CROSSREF_MIN_INTERVAL - timeSinceLastRequest);
      return;
    }
    
    lastCrossRefRequest = Date.now();
    
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.crossref.org/works?query=${encodedQuery}&rows=${maxResults}&mailto=taskmate@example.com`;
    
    console.log('[CrossRef] Searching:', query);
    
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[CrossRef] Status:', res.statusCode);
        
        if (res.statusCode === 429) {
          console.log('[CrossRef] Rate limit hit, retrying...');
          setTimeout(() => {
            searchCrossRef(query, maxResults).then(resolve);
          }, 5000);
          return;
        }
        
        try {
          const result = JSON.parse(data);
          
          if (result.status === 'ok' && result.message && result.message.items) {
            const papers = result.message.items.map(item => ({
              title: item.title ? item.title[0] : '',
              authors: (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()),
              year: item.published ? (item.published['date-parts'][0][0]) : null,
              journal: item['container-title'] ? item['container-title'][0] : '',
              doi: item.DOI,
              url: item.URL,
              abstract: item.abstract || '',
              citationCount: item['is-referenced-by-count'] || 0
            }));
            
            console.log('[CrossRef] Found:', papers.length);
            resolve({ success: true, papers, query, count: papers.length, total: result.message['total-results'] });
          } else {
            resolve({ success: false, error: 'API error', raw: data.slice(0, 200) });
          }
        } catch (e) {
          console.log('[CrossRef] Parse error:', e.message);
          resolve({ success: false, error: e.message });
        }
      });
    }).on('error', (e) => {
      console.log('[CrossRef] Error:', e.message);
      resolve({ success: false, error: e.message });
    });
    
    setTimeout(() => {
      req.destroy();
      if (!resolve.called) {
        resolve.called = true;
        console.log('[CrossRef] Timeout!');
        resolve({ success: false, error: '请求超时（超过10秒）' });
      }
    }, SEARCH_TIMEOUT);
  });
}

function getJournals() {
  try {
    const journals = readJson(journalsFile, { categories: {}, all: [] });
    return { success: true, journals, count: journals.all.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function searchSemanticScholar(query, maxResults = 5) {
  return new Promise((resolve) => {
    resolve.called = false;
    const now = Date.now();
    const timeSinceLastRequest = now - lastSemanticRequest;
    
    if (timeSinceLastRequest < SEMANTIC_MIN_INTERVAL) {
      const waitTime = SEMANTIC_MIN_INTERVAL - timeSinceLastRequest;
      console.log(`[Semantic Scholar] Rate limit: waiting ${waitTime}ms before request...`);
      setTimeout(() => {
        searchSemanticScholar(query, maxResults).then(resolve);
      }, waitTime);
      return;
    }
    
    lastSemanticRequest = Date.now();
    
    console.log('[Semantic Scholar] Searching:', query);
    
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=${maxResults}&fields=title,authors,year,abstract,citationCount,externalIds`;
    
    const options = {
      hostname: 'api.semanticscholar.org',
      path: `/graph/v1/paper/search?query=${encodedQuery}&limit=${maxResults}&fields=title,authors,year,abstract,citationCount,externalIds`,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[Semantic Scholar] Status:', res.statusCode);
        
        if (res.statusCode === 429) {
          console.log('[Semantic Scholar] Rate limit hit! Waiting longer...');
          setTimeout(() => {
            searchSemanticScholar(query, maxResults).then(resolve);
          }, 15000);
          return;
        }
        
        try {
          const result = JSON.parse(data);
          
          if (result.error) {
            console.log('[Semantic Scholar] API Error:', result.error);
            resolve({ success: false, error: result.error });
            return;
          }
          
          const papers = (result.data || []).map(p => ({
            title: p.title,
            authors: (p.authors || []).map(a => a.name),
            year: p.year,
            abstract: p.abstract,
            citationCount: p.citationCount,
            arxivId: p.externalIds?.ArXiv,
            doi: p.externalIds?.DOI
          }));
          
          console.log('[Semantic Scholar] Found papers:', papers.length);
          resolve({ success: true, papers, query, count: papers.length });
        } catch (e) {
          console.log('[Semantic Scholar] Parse error:', e.message, data.slice(0, 200));
          resolve({ success: false, error: e.message, raw: data.slice(0, 500) });
        }
      });
    });
    
    req.on('error', (e) => {
      console.log('[Semantic Scholar] Error:', e.message);
      resolve({ success: false, error: e.message });
    });
    
    req.end();
    
    setTimeout(() => {
      req.destroy();
      if (!resolve.called) {
        resolve.called = true;
        console.log('[Semantic Scholar] Timeout!');
        resolve({ success: false, error: '请求超时（超过10秒）' });
      }
    }, SEARCH_TIMEOUT);
  });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    pdfParser.ensurePapersDir();
    cb(null, papersBaseDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

app.post('/api/papers/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      res.json({ success: false, error: '没有上传文件' });
      return;
    }
    
    const fileName = req.file.originalname;
    const arxivIdMatch = fileName.match(/(\d{4}\.\d{4,5})/);
    const arxivId = arxivIdMatch ? arxivIdMatch[1] : null;
    
    res.json({
      success: true,
      fileName: fileName,
      arxivId: arxivId,
      filePath: req.file.path,
      message: 'PDF 文件上传成功'
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/papers/list', (req, res) => {
  try {
    const papers = pdfParser.getAllPapers();
    res.json({ success: true, papers });
  } catch (e) {
    res.json({ success: false, error: e.message, papers: [] });
  }
});

app.get('/api/papers/find', (req, res) => {
  const { title } = req.query;
  try {
    const paper = pdfParser.findPaperByTitle(title || '');
    if (paper) {
      res.json({ success: true, paper });
    } else {
      res.json({ success: false, error: '未找到论文' });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/papers/delete', (req, res) => {
  const { fileName, filePath } = req.body;
  try {
    let targetPath = filePath;
    if (!targetPath && fileName) {
      targetPath = path.join(papersBaseDir, fileName);
    }
    
    if (!targetPath || !fs.existsSync(targetPath)) {
      res.json({ success: false, error: '文件不存在' });
      return;
    }
    
    fs.unlinkSync(targetPath);
    res.json({ success: true, message: '删除成功' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/papers/open-folder', (req, res) => {
  const { fileName, filePath } = req.body;
  try {
    let targetPath = filePath;
    if (!targetPath && fileName) {
      targetPath = path.join(papersBaseDir, fileName);
    }
    
    if (!targetPath || !fs.existsSync(targetPath)) {
      res.json({ success: false, error: '文件不存在' });
      return;
    }
    
    const { exec } = require('child_process');
    const folderPath = path.dirname(targetPath);
    exec(`explorer "${folderPath}"`);
    res.json({ success: true, message: '已打开文件夹' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/papers/ai-rename', async (req, res) => {
  const { fileName } = req.body;
  
  if (!fileName) {
    res.json({ success: false, error: '请提供文件名' });
    return;
  }
  
  const filePath = path.join(papersBaseDir, fileName);
  if (!fs.existsSync(filePath)) {
    res.json({ success: false, error: '文件不存在' });
    return;
  }
  
  try {
    const parseResult = await pdfParser.parsePDF(filePath);
    if (!parseResult.success) {
      res.json({ success: false, error: 'PDF解析失败: ' + parseResult.error });
      return;
    }
    
    const text = parseResult.text;
    const maxLength = 5000;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength) : text;
    
    const titlePrompt = `请从以下论文内容中提取准确的论文标题（Title）。只返回论文标题，不要返回其他内容。如果无法确定标题，请返回"无法识别"。

论文内容：
---
${truncatedText}
---`;

    const messages = [
      { role: 'system', content: '你是一个论文信息提取助手，专门从论文内容中提取准确信息。' },
      { role: 'user', content: titlePrompt }
    ];
    
    const url = new URL(`${API_BASE_URL}/v1/chat/completions`);
    const postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      temperature: 0.3
    });
    
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    };
    
    const titleResult = await new Promise((resolve, reject) => {
      const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.choices && result.choices[0] && result.choices[0].message) {
              resolve(result.choices[0].message.content.trim());
            } else if (result.error) {
              reject(new Error('API错误: ' + result.error.message));
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      
      apiReq.on('error', reject);
      apiReq.write(postData);
      apiReq.end();
    });
    
    if (!titleResult) {
      res.json({ success: false, error: '无法提取论文标题' });
      return;
    }
    
    let newTitle = titleResult.replace(/[<>:"/\\|?*]/g, '').trim();
    if (newTitle.length > 100) {
      newTitle = newTitle.substring(0, 100);
    }
    
    const ext = path.extname(fileName);
    const newFileName = newTitle + ext;
    const newFilePath = path.join(papersBaseDir, newFileName);
    
    if (fs.existsSync(newFilePath) && newFilePath !== filePath) {
      res.json({ success: false, error: '文件名已存在' });
      return;
    }
    
    fs.renameSync(filePath, newFilePath);
    
    res.json({ 
      success: true, 
      newName: newFileName,
      message: '重命名成功'
    });
    
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const API_BASE_URL = 'https://api.deepseek.com';

if (!DEEPSEEK_API_KEY) {
  console.error('错误：请设置 DEEPSEEK_API_KEY 环境变量');
  console.error('在 Vercel 中，请在 Settings > Environment Variables 中配置');
  console.error('本地运行: DEEPSEEK_API_KEY=your_key node server.js');
}

const tasksFile = path.join(dataDir, 'tasks.json');
const papersFile = path.join(dataDir, 'papers.json');
const keywordsFile = path.join(dataDir, 'keywords.json');
const journalsFile = path.join(dataDir, 'journals.json');
const papersBaseDir = path.join(dataDir, 'papers');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function ensurePapersDir() {
  if (!fs.existsSync(papersBaseDir)) {
    fs.mkdirSync(papersBaseDir, { recursive: true });
  }
}

function createFolder(folderName) {
  try {
    ensurePapersDir();
    const folderPath = path.join(papersBaseDir, folderName);
    
    if (fs.existsSync(folderPath)) {
      return { success: false, error: '文件夹已存在' };
    }
    
    fs.mkdirSync(folderPath, { recursive: true });
    return { success: true, message: `已创建文件夹: ${folderName}`, folderPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function deleteFolder(folderName) {
  try {
    const folderPath = path.join(papersBaseDir, folderName);
    
    if (!fs.existsSync(folderPath)) {
      return { success: false, error: '文件夹不存在' };
    }
    
    const files = fs.readdirSync(folderPath);
    if (files.length > 0) {
      return { success: false, error: '文件夹不为空，无法删除' };
    }
    
    fs.rmdirSync(folderPath);
    return { success: true, message: `已删除文件夹: ${folderName}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function renameFolder(oldName, newName) {
  try {
    const oldPath = path.join(papersBaseDir, oldName);
    const newPath = path.join(papersBaseDir, newName);
    
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: '原文件夹不存在' };
    }
    
    if (fs.existsSync(newPath)) {
      return { success: false, error: '新文件夹名称已存在' };
    }
    
    fs.renameSync(oldPath, newPath);
    return { success: true, message: `已将文件夹 "${oldName}" 重命名为 "${newName}"` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function listFolders() {
  try {
    ensurePapersDir();
    const items = fs.readdirSync(papersBaseDir, { withFileTypes: true });
    const folders = items
      .filter(item => item.isDirectory())
      .map(item => item.name);
    
    const rootFiles = items
      .filter(item => item.isFile() && item.name.endsWith('.pdf'))
      .map(item => item.name);
    
    return { success: true, folders, rootFiles };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function movePaper(fileName, folderName) {
  try {
    const srcPath = path.join(papersBaseDir, fileName);
    const destFolderPath = path.join(papersBaseDir, folderName);
    
    if (!fs.existsSync(srcPath)) {
      return { success: false, error: '文件不存在' };
    }
    
    if (!fs.existsSync(destFolderPath)) {
      return { success: false, error: '目标文件夹不存在' };
    }
    
    const destPath = path.join(destFolderPath, fileName);
    fs.renameSync(srcPath, destPath);
    
    return { success: true, message: `已将 "${fileName}" 移动到文件夹 "${folderName}"` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function readJson(filePath, defaultData = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
  }
  return defaultData;
}

function writeJson(filePath, data) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e);
  }
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'save_task',
      description: '保存或更新一个任务。输入应该是JSON字符串，包含：title(任务标题), project(项目名), priority(优先级1-5), dueDate(截止日期YYYY-MM-DD), description(详细说明)。如果任务已存在则更新，不存在则创建。',
      parameters: {
        type: 'object',
        properties: {
          taskJson: { type: 'string', description: '任务JSON字符串' }
        },
        required: ['taskJson']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_tasks',
      description: '获取所有任务。返回任务列表。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: '删除一个任务。输入是任务ID。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务ID' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: '标记任务为完成。输入是任务ID。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务ID' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_paper',
      description: '保存论文信息。输入应该是JSON字符串，包含：title(标题), authors(作者), year(年份), abstract(摘要), arxivId(arXiv ID), doi(DOI)。',
      parameters: {
        type: 'object',
        properties: {
          paperJson: { type: 'string', description: '论文JSON字符串' }
        },
        required: ['paperJson']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_papers',
      description: '获取所有保存的论文。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_folders',
      description: '列出论文库中的所有文件夹和文件。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_folder',
      description: '在论文库中创建新文件夹。用于整理论文。',
      parameters: {
        type: 'object',
        properties: {
          folderName: { type: 'string', description: '新文件夹名称' }
        },
        required: ['folderName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_folder',
      description: '删除论文库中的文件夹。只能删除空文件夹。',
      parameters: {
        type: 'object',
        properties: {
          folderName: { type: 'string', description: '要删除的文件夹名称' }
        },
        required: ['folderName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_folder',
      description: '重命名论文库中的文件夹。',
      parameters: {
        type: 'object',
        properties: {
          oldName: { type: 'string', description: '原文件夹名称' },
          newName: { type: 'string', description: '新文件夹名称' }
        },
        required: ['oldName', 'newName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_paper',
      description: '将论文移动到指定文件夹。',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string', description: '文件名（含扩展名）' },
          folderName: { type: 'string', description: '目标文件夹名称' }
        },
        required: ['fileName', 'folderName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_keyword',
      description: '保存科研关键词。输入应该是JSON字符串，包含：keyword(关键词), field(领域), description(描述)。',
      parameters: {
        type: 'object',
        properties: {
          keywordJson: { type: 'string', description: '关键词JSON字符串' }
        },
        required: ['keywordJson']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_keywords',
      description: '获取所有保存的关键词。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前时间，用于日程规划。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_arxiv_papers',
      description: '搜索 arXiv 论文。输入是搜索关键词和最大结果数。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          maxResults: { type: 'number', description: '最大结果数，默认5' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_semantic_scholar',
      description: '搜索 Semantic Scholar 论文。输入是搜索关键词和最大结果数。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          maxResults: { type: 'number', description: '最大结果数，默认5' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_crossref',
      description: '搜索 CrossRef 学术论文。推荐优先使用此工具，因为它更稳定且包含所有主流期刊。输入是搜索关键词和最大结果数。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          maxResults: { type: 'number', 'description': '最大结果数，默认5' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_journals',
      description: '获取用户关注的期刊列表。返回用户筛选论文时优先关注的期刊来源。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'download_arxiv_pdf',
      description: '下载 arXiv 论文 PDF。输入是 arXiv ID（如 2407.12858）。返回 PDF 下载链接。',
      parameters: {
        type: 'object',
        properties: {
          arxivId: { type: 'string', description: 'arXiv ID（如 2407.12858）' }
        },
        required: ['arxivId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_paper_analysis',
      description: '对已下载的论文进行精读分析。使用此工具前，用户必须已经下载了对应的 PDF 文件。输入是 arXiv ID。返回精读报告。',
      parameters: {
        type: 'object',
        properties: {
          arxivId: { type: 'string', description: 'arXiv ID（如 2406.03708）' }
        },
        required: ['arxivId']
      }
    }
  }
];

async function executeTool(toolName, args) {
  switch (toolName) {
    case 'save_task': {
      const task = JSON.parse(args.taskJson);
      const data = readJson(tasksFile, { tasks: {} });
      const tasks = data.tasks || {};
      const id = task.id || Date.now().toString(36);
      task.id = id;
      task.createdAt = task.createdAt || new Date().toISOString();
      tasks[id] = task;
      writeJson(tasksFile, data);
      return { success: true, taskId: id, message: `任务已保存: ${task.title}` };
    }
    case 'get_tasks': {
      const data = readJson(tasksFile, { tasks: {} });
      return data.tasks || {};
    }
    case 'delete_task': {
      const data = readJson(tasksFile, { tasks: {} });
      const tasks = data.tasks || {};
      delete tasks[args.taskId];
      writeJson(tasksFile, data);
      return { success: true, message: `任务 ${args.taskId} 已删除` };
    }
    case 'complete_task': {
      const data = readJson(tasksFile, { tasks: {} });
      const tasks = data.tasks || {};
      const task = tasks[args.taskId];
      if (task) {
        task.completed = true;
        task.completedAt = new Date().toISOString();
        writeJson(tasksFile, data);
        return { success: true, message: `任务 ${args.taskId} 已标记为完成` };
      }
      return { success: false, error: '任务不存在' };
    }
    case 'save_paper': {
      const paper = JSON.parse(args.paperJson);
      const papers = readJson(papersFile, []);
      paper.id = paper.id || Date.now().toString(36);
      paper.savedAt = new Date().toISOString();
      papers.push(paper);
      writeJson(papersFile, papers);
      return { success: true, message: `论文已保存: ${paper.title}` };
    }
    case 'get_papers': {
      return readJson(papersFile, []);
    }
    case 'save_keyword': {
      const keyword = JSON.parse(args.keywordJson);
      const keywords = readJson(keywordsFile, []);
      keyword.id = keyword.id || Date.now().toString(36);
      keyword.savedAt = new Date().toISOString();
      keywords.push(keyword);
      writeJson(keywordsFile, keywords);
      return { success: true, message: `关键词已保存: ${keyword.keyword}` };
    }
    case 'get_keywords': {
      return readJson(keywordsFile, []);
    }
    case 'get_current_time': {
      const now = new Date();
      return { now: now.toISOString(), formatted: now.toLocaleString('zh-CN'), timestamp: now.getTime() };
    }
    case 'search_arxiv_papers': {
      return searchArxiv(args.query, args.maxResults || 5);
    }
    case 'search_semantic_scholar': {
      return searchSemanticScholar(args.query, args.maxResults || 5);
    }
    case 'search_crossref': {
      return searchCrossRef(args.query, args.maxResults || 5);
    }
    case 'get_journals': {
      return getJournals();
    }
    case 'create_folder': {
      return createFolder(args.folderName);
    }
    case 'delete_folder': {
      return deleteFolder(args.folderName);
    }
    case 'rename_folder': {
      return renameFolder(args.oldName, args.newName);
    }
    case 'list_folders': {
      return listFolders();
    }
    case 'move_paper': {
      return movePaper(args.fileName, args.folderName);
    }
    case 'download_arxiv_pdf': {
      const arxivId = args.arxivId;
      const result = await downloadArxivPDF(arxivId);
      return result;
    }
    case 'generate_paper_analysis': {
      const arxivId = args.arxivId;
      const pdfPath = pdfParser.getPaperPDFPath(arxivId);
      if (!pdfPath) {
        return { success: false, error: 'PDF文件不存在，请先使用 download_arxiv_pdf 下载论文' };
      }
      
      const parseResult = await pdfParser.parsePDF(pdfPath);
      if (!parseResult.success) {
        return { success: false, error: 'PDF解析失败: ' + parseResult.error };
      }
      
      const text = parseResult.text;
      const maxLength = 15000;
      const truncatedText = text.length > maxLength ? text.slice(0, maxLength) + '\n\n[...内容已截断...]' : text;
      
      const analysisPrompt = `你是一位资深学术研究助理，专长于深度解读顶级会议/期刊论文。你的报告需要兼具"精准复述"与"批判性洞见"，语言专业、凝练、逻辑清晰，面向同领域研究者。

请根据提供的论文内容，生成一份结构化的论文精读报告。严格遵循下方格式与要求，不要遗漏任何部分。

# 报告结构及内容要求

## 1. 论文信息总览
- 标题：中英双语
- 作者/机构：第一作者及核心团队所属单位
- 发表信息：会议/期刊名称、年份、级别（如 CCF-A / SCI一区）
- 一句话总结：用不超过 50 字概括本文最核心的贡献

## 2. 研究背景与动机
- 简明阐述该领域的基本背景和公认挑战
- 指出现有解决方案的核心瓶颈（技术、效率、泛化性等）
- 说明作者试图填补的具体缺口

## 3. 核心问题定义
- 用技术语言明确本文要解决的"研究问题"
- 若是方法类论文，写出其优化目标、输入/输出形式
- 可提炼为数学符号表达式

## 4. 方法与模型
- 整体框架：用文字描述架构流程
- 关键创新点：提炼 2–3 个技术亮点，逐一解释
- 核心公式/算法：摘录并解释最重要的 1–2 个公式
- 理论保证（如有）

## 5. 实验设计与结果
- 数据集：名称、规模、来源、评价指标
- 对比基线：与哪些 SOTA 方法比较
- 主实验结果：分点列出关键量化发现，标注提升幅度
- 消融实验：哪些部件起到了决定性作用
- 可复现性：是否开源代码、提供超参数和硬件环境

## 6. 贡献与创新性评估
- 列出 3 个主要贡献
- 评估其创新高度（范式革新、精巧改进还是组合应用）
- 对比最相关工作的本质区别

## 7. 局限性讨论
- 作者自述的局限
- 潜在局限（实验不充分、对比欠公平、理论缺失等）
- 方法适用的边界条件

## 8. 启发与延伸思考
- 对该研究方向未来趋势的启发
- 可能改进的点
- 能否迁移到其他领域
- 值得跟进的后续工作

## 9. 阅读总结
- 论文类型标签（例如：理论证明 / 实用系统 / 经验研究）
- 推荐指数（1–5 星）及推荐读者画像
- 关键知识点清单

# 输出要求
- 全程使用 Markdown 标题和列表，层次分明
- 分析需建立在论文事实基础上，引用原文关键句时用【""】标出
- 批判性思考部分请提供逻辑严密的论据
- 全文使用中文撰写，专业术语附注英文原文

下面是论文内容：
---
${truncatedText}
---`;

      const analysisMessages = [
        { role: 'system', content: '你是一位资深学术研究助理，专长于深度解读顶级会议/期刊论文。你的报告需要兼具"精准复述"与"批判性洞见"，语言专业、凝练、逻辑清晰，面向同领域研究者。' },
        { role: 'user', content: analysisPrompt }
      ];
      
      const url = new URL(`${API_BASE_URL}/v1/chat/completions`);
      const postData = JSON.stringify({
        model: 'deepseek-chat',
        messages: analysisMessages,
        temperature: 0.7
      });
      
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        }
      };
      
      return new Promise((resolve) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.choices && result.choices[0] && result.choices[0].message) {
                const analysisResult = result.choices[0].message.content;
                
                const paperInfo = {
                  arxivId,
                  pdfPath,
                  title: '',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  analysis: analysisResult
                };
                
                pdfParser.savePaperAnalysis(arxivId, paperInfo);
                
                resolve({ success: true, analysis: analysisResult });
              } else if (result.error) {
                resolve({ success: false, error: 'API错误: ' + result.error.message });
              } else {
                resolve({ success: false, error: '未知错误' });
              }
            } catch (e) {
              resolve({ success: false, error: '解析响应失败: ' + e.message });
            }
          });
        });
        
        req.on('error', (e) => {
          resolve({ success: false, error: 'API请求失败: ' + e.message });
        });
        
        req.write(postData);
        req.end();
      });
    }
    default:
      return { error: '未知工具: ' + toolName };
  }
}

function callDeepSeekAPI(messages, isStreaming = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE_URL}/v1/chat/completions`);
    
    const postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      tools: tools,
      stream: isStreaming,
      temperature: 0.7
    });

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

let currentAbortController = null;
let chatMessages = [];

app.post('/api/chat', async (req, res) => {
  const { messages: newMessages } = req.body;
  chatMessages = newMessages || [];

  if (!DEEPSEEK_API_KEY) {
    res.write(`data: ${JSON.stringify({ type: 'error', content: '请配置 DEEPSEEK_API_KEY 环境变量' })}\n\n`);
    res.end();
    return;
  }

  currentAbortController = new AbortController();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const systemMessage = {
      role: 'system',
      content: `你是 TaskMate，一个专业的 AI 科研助手。

## 你的核心能力

### 1. 任务管理
- save_task: 创建/更新任务
- get_tasks: 查看所有任务
- delete_task: 删除任务
- complete_task: 完成任务

### 2. 论文搜索（最重要！）
当用户想要搜索论文时，你**必须**使用以下工具（按优先级）：
- **search_crossref**: 搜索 CrossRef 学术论文库（**推荐首选，最稳定**）
- **search_arxiv_papers**: 搜索 arXiv 预印本论文
- **search_semantic_scholar**: 搜索 Semantic Scholar（备用）

搜索参数：
- query: 搜索关键词（如 "soft robotics flexible waveguide"）
- maxResults: 返回数量（默认5篇）

### 3. 期刊筛选
- **get_journals**: 获取用户关注的期刊列表（用于筛选高质量论文）

### 4. 论文库管理
- save_paper: 保存论文到本地库
- get_papers: 查看本地论文库
- download_arxiv_pdf: 下载 arXiv 论文 PDF
- **list_folders**: 列出论文库中的所有文件夹和文件
- **create_folder**: 创建新文件夹（用于整理论文）
- **delete_folder**: 删除文件夹（只能删除空文件夹）
- **rename_folder**: 重命名文件夹
- **move_paper**: 将论文移动到指定文件夹

### 5. 关键词管理
- save_keyword: 保存科研关键词
- get_keywords: 查看已保存关键词

### 6. 其他
- get_current_time: 获取当前时间

## 关键规则（必须遵守！）

1. **当用户要求搜索论文时，你必须调用 search_crossref（首选）或 search_arxiv_papers 工具！**
2. **在返回论文结果后，建议调用 get_journals 告知用户哪些是高质量期刊**
3. **当用户要求下载论文 PDF 时，你必须调用 download_arxiv_pdf 工具！**
4. **当用户要求对论文进行精读分析时，你必须调用 generate_paper_analysis 工具！**（前提是PDF已下载）
5. **绝对不要只是给出口头回答，必须实际调用工具！**
6. **搜索到论文后，建议保存到本地论文库（使用 save_paper）**

## 会话管理规则（重要！）

你需要判断当前对话是否应该**开启新话题**。判断标准：
- 当前问题与之前对话主题是否相关？
- 如果不相关，应该提示用户开启新对话

**如果判断需要新对话**，在回答末尾添加以下格式（仅当需要时）：
"\n\n[NEW_TOPIC] 建议开启新对话来讨论这个新话题，请回复 '好的，我来开启新对话'，不要继续当前话题。"

不要主动添加这个标记，只有当话题确实改变时才添加。

## 输出格式

搜索论文时的正确流程：
1. 调用 search_arxiv_papers 工具
2. 等待工具返回结果
3. 将结果展示给用户
4. 可选：调用 save_paper 保存论文

不要只是说"让我搜索..."，要直接调用工具！`
    };

    const userMessages = chatMessages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';
    const firstUserMessage = userMessages[0]?.content || '';
    
    const isNewTopic = chatMessages.length > 4 && firstUserMessage && lastUserMessage && 
      !lastUserMessage.toLowerCase().includes(firstUserMessage.toLowerCase().slice(0, 20)) &&
      !firstUserMessage.toLowerCase().includes(lastUserMessage.toLowerCase().slice(0, 20));
    
    let sessionInstructions = '';
    if (isNewTopic) {
      sessionInstructions = `\n\n[注意] 检测到话题可能已改变。如果这个新问题与之前的对话无关，请提示用户开启新对话。`;
    }

    const messages = [systemMessage, ...chatMessages];
    
    if (sessionInstructions && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content = lastMsg.content + sessionInstructions;
      } else if (lastMsg.role === 'assistant') {
        lastMsg.content = lastMsg.content + sessionInstructions;
      }
    }
    
    let hasToolCalls = true;
    let iterations = 0;
    const maxIterations = 10;

    while (hasToolCalls && iterations < maxIterations) {
      iterations++;
      
      if (currentAbortController.signal.aborted) {
        res.write(`data: ${JSON.stringify({ type: 'done', content: '已中止' })}\n\n`);
        res.end();
        return;
      }

      const response = await callDeepSeekAPI(messages);
      
      if (response.choices && response.choices[0]) {
        const choice = response.choices[0];
        
        if (choice.message.content) {
          res.write(`data: ${JSON.stringify({ type: 'reasoning', content: choice.message.content })}\n\n`);
          res.flushHeaders();
        }

        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          for (const toolCall of choice.message.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);
            
            res.write(`data: ${JSON.stringify({ type: 'reasoning', content: `\n[调用工具: ${toolName}]\n参数: ${JSON.stringify(toolArgs)}` })}\n\n`);
            res.flushHeaders();

            const result = await executeTool(toolName, toolArgs);
            
            res.write(`data: ${JSON.stringify({ type: 'reasoning', content: `\n[工具返回: ${JSON.stringify(result)}` })}\n\n`);
            res.flushHeaders();

            messages.push({
              role: 'assistant',
              content: null,
              tool_calls: [{ id: toolCall.id, type: 'function', function: { name: toolName, arguments: toolCall.function.arguments } }]
            });
            
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
          }
        } else {
          hasToolCalls = false;
          res.write(`data: ${JSON.stringify({ type: 'content', content: choice.message.content })}\n\n`);
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);

  } catch (error) {
    console.error('Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
  } finally {
    res.end();
  }
});

app.post('/api/abort', (req, res) => {
  if (currentAbortController) {
    currentAbortController.abort();
    res.json({ success: true });
  } else {
    res.json({ success: false, message: '没有正在进行的请求' });
  }
});

app.use(express.static(publicDir));

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
