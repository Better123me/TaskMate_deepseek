import os
import json
import requests
import asyncio
from typing import Optional, List, Dict, Any
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field

from langchain_core.tools import tool


BASE_DIR = Path(__file__).parent.parent
RESEARCH_DATA_DIR = BASE_DIR / "data" / "research"
RESEARCH_DATA_DIR.mkdir(parents=True, exist_ok=True)

KEYWORDS_FILE = RESEARCH_DATA_DIR / "keywords.json"
PAPERS_FILE = RESEARCH_DATA_DIR / "papers.json"


def _load_json(file_path: Path) -> Dict:
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_json(file_path: Path, data: Dict):
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@dataclass
class Keyword:
    keyword: str
    category: str = "general"
    added_at: str = field(default_factory=lambda: datetime.now().isoformat())
    notes: str = ""
    priority: int = 0


@dataclass
class Paper:
    title: str
    authors: List[str]
    abstract: str = ""
    arxiv_id: str = ""
    doi: str = ""
    url: str = ""
    pdf_url: str = ""
    published_date: str = ""
    added_at: str = field(default_factory=lambda: datetime.now().isoformat())
    notes: str = ""
    read_status: str = "unread"
    summary: str = ""


@tool
def save_research_keyword(
    keyword: str,
    category: str = "general",
    notes: str = "",
    priority: int = 0
) -> str:
    """保存科研感兴趣的关键词。
    
    参数:
        keyword: 关键词（必填），例如 "大语言模型", "强化学习"
        category: 分类（可选），可选值: general(通用), AI(人工智能), ML(机器学习), NLP(自然语言处理), CV(计算机视觉), Other(其他)，默认 general
        notes: 备注（可选），关于这个关键词的备注信息
        priority: 优先级（可选），0=低, 1=中, 2=高，默认 0
    
    返回:
        保存结果
    """
    try:
        keywords_data = _load_json(KEYWORDS_FILE)
        
        if "keywords" not in keywords_data:
            keywords_data["keywords"] = []
        
        for kw in keywords_data["keywords"]:
            if kw.get("keyword", "").lower() == keyword.lower():
                return f"error:关键词 '{keyword}' 已存在"
        
        new_keyword = {
            "keyword": keyword,
            "category": category,
            "notes": notes,
            "priority": priority,
            "added_at": datetime.now().isoformat()
        }
        
        keywords_data["keywords"].append(new_keyword)
        _save_json(KEYWORDS_FILE, keywords_data)
        
        return f"success:关键词 '{keyword}' 已保存！分类: {category}, 优先级: {priority}"
    
    except Exception as e:
        return f"error:保存关键词失败 - {str(e)}"


@tool
def get_research_keywords(
    category: Optional[str] = None,
    priority: Optional[int] = None
) -> str:
    """获取保存的科研关键词。
    
    参数:
        category: 分类筛选（可选），不指定则返回所有
        priority: 优先级筛选（可选），0=低, 1=中, 2=高
    
    返回:
        关键词列表
    """
    try:
        keywords_data = _load_json(KEYWORDS_FILE)
        keywords = keywords_data.get("keywords", [])
        
        if category:
            keywords = [k for k in keywords if k.get("category") == category]
        
        if priority is not None:
            keywords = [k for k in keywords if k.get("priority") == priority]
        
        if not keywords:
            return "没有找到保存的关键词"
        
        category_map = {"general": "通用", "AI": "人工智能", "ML": "机器学习", "NLP": "自然语言处理", "CV": "计算机视觉", "Other": "其他"}
        priority_map = {0: "低", 1: "中", 2: "高"}
        
        result = f"共找到 {len(keywords)} 个关键词:\n\n"
        for i, kw in enumerate(keywords, 1):
            cat = category_map.get(kw.get("category", "general"), "通用")
            pri = priority_map.get(kw.get("priority", 0), "低")
            result += f"{i}. {kw.get('keyword', '')}\n"
            result += f"   分类: {cat} | 优先级: {pri}\n"
            if kw.get("notes"):
                result += f"   备注: {kw.get('notes')}\n"
            result += "\n"
        
        return result
    
    except Exception as e:
        return f"error:获取关键词失败 - {str(e)}"


@tool
def search_arxiv_papers(
    query: str,
    max_results: int = 5
) -> str:
    """在 arXiv 上搜索学术论文。
    
    参数:
        query: 搜索关键词（必填），例如 "large language model", "transformer"
        max_results: 最大返回数量（可选），默认 5，最多 10
    
    返回:
        论文列表信息
    """
    try:
        import urllib.parse
        import time
        
        max_results = min(max_results, 10)
        
        search_url = "http://export.arxiv.org/api/query"
        params = {
            "search_query": f"all:{query}",
            "start": 0,
            "max_results": max_results,
            "sortBy": "relevance",
            "sortOrder": "descending"
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        try:
            response = requests.get(search_url, params=params, headers=headers, timeout=15)
            response.raise_for_status()
        except requests.exceptions.Timeout:
            return "error:arXiv API 请求超时，请稍后重试或检查网络连接"
        except requests.exceptions.ConnectionError:
            return "error:无法连接到 arXiv API，请检查网络连接"
        
        import xml.etree.ElementTree as ET
        root = ET.fromstring(response.content)
        
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        entries = root.findall(".//atom:entry", ns)
        
        if not entries:
            return f"没有找到与 '{query}' 相关的论文"
        
        result = f"找到 {len(entries)} 篇相关论文:\n\n"
        
        for i, entry in enumerate(entries, 1):
            title = entry.find("atom:title", ns).text.strip()
            summary = entry.find("atom:summary", ns).text.strip()
            authors = [a.find("atom:name", ns).text for a in entry.findall("atom:author", ns)]
            published = entry.find("atom:published", ns).text[:10] if entry.find("atom:published", ns) is not None else ""
            
            arxiv_id = ""
            id_text = entry.find("atom:id", ns).text if entry.find("atom:id", ns) is not None else ""
            if "arxiv.org/abs/" in id_text:
                arxiv_id = id_text.split("arxiv.org/abs/")[-1]
            
            pdf_url = ""
            for link in entry.findall("atom:link", ns):
                if link.get("title") == "pdf":
                    pdf_url = link.get("href", "")
                    break
            
            result += f"**{i}. {title}**\n"
            result += f"   作者: {', '.join(authors[:3])}{'...' if len(authors) > 3 else ''}\n"
            result += f"   发表日期: {published}\n"
            result += f"   arXiv ID: {arxiv_id}\n"
            result += f"   摘要: {summary[:200]}...\n"
            if pdf_url:
                result += f"   PDF: {pdf_url}\n"
            result += "\n"
        
        return result
    
    except Exception as e:
        return f"error:搜索论文失败 - {str(e)}"


@tool
def search_semantic_scholar(
    query: str,
    max_results: int = 5
) -> str:
    """在 Semantic Scholar 上搜索学术论文。
    
    参数:
        query: 搜索关键词（必填）
        max_results: 最大返回数量（可选），默认 5，最多 10
    
    返回:
        论文列表信息
    """
    try:
        import time
        
        url = "https://api.semanticscholar.org/graph/v1/paper/search"
        params = {
            "query": query,
            "limit": min(max_results, 10),
            "fields": "title,authors,abstract,year,venue,citationCount,openAccessPdf,externalIds"
        }
        
        headers = {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0"
        }
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=15)
        except requests.exceptions.Timeout:
            return "error:Semantic Scholar API 请求超时，请稍后重试"
        except requests.exceptions.ConnectionError:
            return "error:无法连接到 Semantic Scholar API"
        
        if response.status_code == 429:
            return "error:API请求过于频繁，请稍后再试"
        elif response.status_code != 200:
            return f"error:API请求失败，状态码: {response.status_code}"
        
        data = response.json()
        papers = data.get("data", [])
        
        if not papers:
            return f"没有找到与 '{query}' 相关的论文"
        
        result = f"找到 {len(papers)} 篇相关论文:\n\n"
        
        for i, paper in enumerate(papers, 1):
            title = paper.get("title", "无标题")
            authors = [a.get("name", "") for a in paper.get("authors", [])]
            abstract = paper.get("abstract", "")
            year = paper.get("year", "")
            venue = paper.get("venue", "")
            citations = paper.get("citationCount", 0)
            
            external_ids = paper.get("externalIds", {})
            arxiv_id = external_ids.get("ArXiv", "") if external_ids else ""
            doi = external_ids.get("DOI", "") if external_ids else ""
            
            pdf_url = ""
            oa_pdf = paper.get("openAccessPdf")
            if oa_pdf:
                pdf_url = oa_pdf.get("url", "")
            
            result += f"**{i}. {title}**\n"
            result += f"   作者: {', '.join(authors[:3])}{'...' if len(authors) > 3 else ''}\n"
            result += f"   年份: {year} | 会议/期刊: {venue}\n"
            result += f"   引用数: {citations}\n"
            if arxiv_id:
                result += f"   arXiv: {arxiv_id}\n"
            if doi:
                result += f"   DOI: {doi}\n"
            if abstract:
                result += f"   摘要: {abstract[:200]}...\n"
            if pdf_url:
                result += f"   PDF: {pdf_url}\n"
            result += "\n"
        
        return result
    
    except Exception as e:
        return f"error:搜索论文失败 - {str(e)}"


@tool
def download_paper_pdf(paper_url: str, title: str = "") -> str:
    """下载论文PDF到本地。
    
    参数:
        paper_url: 论文PDF的URL（必填），例如 arXiv PDF链接
        title: 论文标题（可选），用于命名文件
    
    返回:
        下载结果
    """
    try:
        pdf_dir = RESEARCH_DATA_DIR / "pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        
        response = requests.get(paper_url, timeout=60, stream=True)
        response.raise_for_status()
        
        content_type = response.headers.get("Content-Type", "")
        if "pdf" not in content_type.lower() and not paper_url.endswith(".pdf"):
            return f"error:该URL可能不是PDF文件，Content-Type: {content_type}"
        
        if title:
            safe_title = "".join(c for c in title if c.isalnum() or c in " -_").strip()[:50]
            filename = f"{safe_title}.pdf"
        else:
            import hashlib
            filename = f"paper_{hashlib.md5(paper_url.encode()).hexdigest()[:8]}.pdf"
        
        file_path = pdf_dir / filename
        
        with open(file_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        file_size = os.path.getsize(file_path) / 1024 / 1024
        
        return f"success:论文PDF已下载！\n文件路径: {file_path}\n文件大小: {file_size:.2f} MB"
    
    except Exception as e:
        return f"error:下载失败 - {str(e)}"


@tool
def save_paper_info(
    title: str,
    authors: str,
    abstract: str = "",
    arxiv_id: str = "",
    doi: str = "",
    url: str = "",
    pdf_url: str = "",
    published_date: str = "",
    notes: str = ""
) -> str:
    """保存论文信息到本地知识库。
    
    参数:
        title: 论文标题（必填）
        authors: 作者（必填），多个作者用逗号分隔
        abstract: 摘要（可选）
        arxiv_id: arXiv ID（可选）
        doi: DOI（可选）
        url: 论文URL（可选）
        pdf_url: PDF下载链接（可选）
        published_date: 发表日期（可选），格式如 2024-01-01
        notes: 笔记（可选）
    
    返回:
        保存结果
    """
    try:
        papers_data = _load_json(PAPERS_FILE)
        
        if "papers" not in papers_data:
            papers_data["papers"] = []
        
        authors_list = [a.strip() for a in authors.split(",")]
        
        new_paper = {
            "title": title,
            "authors": authors_list,
            "abstract": abstract,
            "arxiv_id": arxiv_id,
            "doi": doi,
            "url": url,
            "pdf_url": pdf_url,
            "published_date": published_date,
            "notes": notes,
            "read_status": "unread",
            "summary": "",
            "added_at": datetime.now().isoformat()
        }
        
        papers_data["papers"].append(new_paper)
        _save_json(PAPERS_FILE, papers_data)
        
        return f"success:论文信息已保存！\n标题: {title}\n作者: {authors_list[0]} 等"
    
    except Exception as e:
        return f"error:保存论文失败 - {str(e)}"


@tool
def get_saved_papers(
    status: Optional[str] = None,
    limit: int = 10
) -> str:
    """获取保存的论文列表。
    
    参数:
        status: 阅读状态筛选（可选），可选值: unread(未读), reading(在读), completed(已读)
        limit: 返回数量（可选），默认 10
    
    返回:
        论文列表
    """
    try:
        papers_data = _load_json(PAPERS_FILE)
        papers = papers_data.get("papers", [])
        
        if status:
            papers = [p for p in papers if p.get("read_status") == status]
        
        papers = papers[:limit]
        
        if not papers:
            return "没有保存的论文"
        
        status_map = {"unread": "未读", "reading": "在读", "completed": "已读"}
        
        result = f"共 {len(papers)} 篇论文:\n\n"
        for i, paper in enumerate(papers, 1):
            status = status_map.get(paper.get("read_status", "unread"), "未读")
            authors = paper.get("authors", [])
            result += f"{i}. {paper.get('title', '')}\n"
            result += f"   作者: {', '.join(authors[:2])}{'...' if len(authors) > 2 else ''}\n"
            result += f"   状态: {status}\n"
            if paper.get("arxiv_id"):
                result += f"   arXiv: {paper.get('arxiv_id')}\n"
            result += "\n"
        
        return result
    
    except Exception as e:
        return f"error:获取论文列表失败 - {str(e)}"


@tool
def read_paper_content(paper_url: str = "", title: str = "") -> str:
    """阅读论文内容（通过URL获取或从本地文件读取）。
    
    参数:
        paper_url: 论文PDF的URL或本地路径（必填）
        title: 论文标题（可选）
    
    返回:
        论文内容摘要
    """
    try:
        content = ""
        
        if paper_url.startswith("http"):
            response = requests.get(paper_url, timeout=60)
            response.raise_for_status()
            
            import tempfile
            import fitz
            
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name
            
            try:
                doc = fitz.open(tmp_path)
                for page in doc:
                    content += page.get_text()
                doc.close()
            finally:
                os.unlink(tmp_path)
        else:
            if not os.path.exists(paper_url):
                return f"error:文件不存在: {paper_url}"
            
            import fitz
            doc = fitz.open(paper_url)
            for page in doc:
                content += page.get_text()
            doc.close()
        
        if not content.strip():
            return "error:无法提取PDF内容"
        
        return f"success:论文内容已提取！\n\n--- 内容预览 ---\n\n{content[:3000]}...\n\n--- 如需完整精读，请使用精读功能 ---"
    
    except ImportError:
        return "error:需要安装 pymupdf 库来读取PDF，请运行: pip install pymupdf"
    except Exception as e:
        return f"error:读取失败 - {str(e)}"


@tool
def summarize_paper(
    title: str,
    authors: str,
    abstract: str = "",
    content: str = "",
    focus: str = "general"
) -> str:
    """使用AI对论文进行精读和总结。
    
    参数:
        title: 论文标题（必填）
        authors: 作者（必填）
        abstract: 摘要（可选），如有请提供
        content: 论文内容（可选），通过 read_paper_content 获取
        focus: 关注点（可选），可选值: general(一般总结), methodology(方法论), results(结果), background(背景)，默认 general
    
    返回:
        论文精读总结
    """
    try:
        from langchain_openai import ChatOpenAI
        from dotenv import load_dotenv
        import os
        
        load_dotenv()
        api_key = os.getenv("DEEPSEEK_API_KEY")
        
        if not api_key:
            return "error:未配置 DEEPSEEK_API_KEY"
        
        llm = ChatOpenAI(
            model="deepseek-chat",
            openai_api_key=api_key,
            base_url="https://api.deepseek.com/v1",
            temperature=0.5
        )
        
        focus_prompts = {
            "general": "请对这篇论文进行全面的总结，包括研究背景、方法、结果和贡献",
            "methodology": "请重点分析这篇论文的研究方法和技术实现",
            "results": "请重点总结论文的实验结果和发现",
            "background": "请分析这篇论文的研究背景和相关工作"
        }
        
        prompt = f"""请精读以下论文并提供{focus_prompts.get(focus, focus_prompts['general'])}。

论文信息：
- 标题: {title}
- 作者: {authors}
- 摘要: {abstract or '无'}

{"论文内容: " + content[:8000] if content else ""}

请用中文回复，提供详细但简洁的分析。"""

        response = llm.invoke(prompt)
        
        return f"📄 论文精读: {title}\n\n{response.content}"
    
    except Exception as e:
        return f"error:论文精读失败 - {str(e)}"


research_tools = [
    save_research_keyword,
    get_research_keywords,
    search_arxiv_papers,
    search_semantic_scholar,
    download_paper_pdf,
    save_paper_info,
    get_saved_papers,
    read_paper_content,
    summarize_paper
]
