import os
import asyncio
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field
from enum import Enum
from dotenv import load_dotenv

load_dotenv()

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

from storage.task_storage import storage

try:
    from research.research_tools import research_tools
except ImportError:
    research_tools = []


@tool
def create_task(
    title: str,
    content: str = "",
    project_id: str = "inbox",
    priority: int = 0,
    due_date: Optional[str] = None
) -> str:
    """创建新任务。
    
    参数:
        title: 任务标题（必填），例如 "完成项目报告"
        content: 任务详细描述（可选）
        project_id: 项目ID（可选），默认 "inbox"，可选值: inbox, work, personal
        priority: 优先级（可选），0=无, 1=低, 3=中, 5=高，默认 0
        due_date: 截止日期（可选），格式如 "2024-12-31"
    
    返回:
        创建成功返回任务ID，失败返回错误信息
    """
    try:
        task = storage.create_task(
            title=title,
            content=content,
            project_id=project_id,
            priority=priority,
            due_date=due_date
        )
        return f"success:任务创建成功！标题: {task.title}, ID: {task.id}"
    except Exception as e:
        return f"error:创建任务失败 - {str(e)}"


@tool
def get_tasks(
    project_id: Optional[str] = None,
    filter_type: str = "all"
) -> str:
    """查询任务列表。
    
    参数:
        project_id: 项目ID（可选），不指定则查询所有项目
        filter_type: 过滤类型（可选），可选值: all(所有), active(进行中), completed(已完成)，默认 all
    
    返回:
        任务列表的详细信息
    """
    try:
        tasks = storage.get_tasks(project_id=project_id, filter_type=filter_type)
        if not tasks:
            return "没有找到任务"
        
        priority_map = {0: "无", 1: "低", 3: "中", 5: "高"}
        status_map = {0: "进行中", 2: "已完成"}
        
        result = f"找到 {len(tasks)} 个任务:\n\n"
        for i, task in enumerate(tasks[:20], 1):
            result += f"{i}. [{status_map.get(task.status, '未知')}] {task.title}\n"
            result += f"   优先级: {priority_map.get(task.priority, '无')}\n"
            result += f"   截止: {task.due_date or '未设置'}\n"
            result += f"   ID: {task.id}\n\n"
        return result
    except Exception as e:
        return f"error:查询任务失败 - {str(e)}"


@tool
def search_tasks(keywords: str) -> str:
    """根据关键词搜索任务。
    
    参数:
        keywords: 搜索关键词，可以是任务标题或内容中的关键词
    
    返回:
        匹配的任务列表
    """
    try:
        all_tasks = storage.get_tasks(filter_type="all")
        if not all_tasks:
            return "没有任务"
        
        keywords_lower = keywords.lower()
        matched = []
        for task in all_tasks:
            if keywords_lower in task.title.lower() or keywords_lower in task.content.lower():
                matched.append(task)
        
        if not matched:
            return f"没有找到包含 '{keywords}' 的任务"
        
        priority_map = {0: "无", 1: "低", 3: "中", 5: "高"}
        status_map = {0: "进行中", 2: "已完成"}
        
        result = f"找到 {len(matched)} 个匹配任务:\n\n"
        for i, task in enumerate(matched[:10], 1):
            result += f"{i}. [{status_map.get(task.status, '未知')}] {task.title}\n"
            result += f"   优先级: {priority_map.get(task.priority, '无')}\n"
            result += f"   ID: {task.id}\n\n"
        return result
    except Exception as e:
        return f"error:搜索任务失败 - {str(e)}"


@tool
def get_task(task_id: str) -> str:
    """获取单个任务的详细信息。
    
    参数:
        task_id: 任务ID（必填）
    
    返回:
        任务的详细信息
    """
    try:
        task = storage.get_task(task_id)
        if not task:
            return "error:任务不存在"
        
        priority_map = {0: "无", 1: "低", 3: "中", 5: "高"}
        status_map = {0: "进行中", 2: "已完成"}
        
        result = f"""任务详情:
• 标题: {task.title}
• 内容: {task.content or '无'}
• 项目: {task.project_id}
• 状态: {status_map.get(task.status, '未知')}
• 优先级: {priority_map.get(task.priority, '无')}
• 截止日期: {task.due_date or '未设置'}
• 创建时间: {task.created_at}
• ID: {task.id}"""
        return result
    except Exception as e:
        return f"error:获取任务失败 - {str(e)}"


@tool
def update_task(
    task_id: str,
    title: Optional[str] = None,
    content: Optional[str] = None,
    priority: Optional[int] = None,
    due_date: Optional[str] = None
) -> str:
    """更新任务信息。
    
    参数:
        task_id: 任务ID（必填）
        title: 新标题（可选）
        content: 新内容（可选）
        priority: 新优先级（可选），0=无, 1=低, 3=中, 5=高
        due_date: 新截止日期（可选），格式如 "2024-12-31"
    
    返回:
        更新结果
    """
    try:
        task = storage.update_task(
            task_id=task_id,
            title=title,
            content=content,
            priority=priority,
            due_date=due_date
        )
        if task:
            return f"success:任务更新成功！标题: {task.title}"
        return "error:任务不存在"
    except Exception as e:
        return f"error:更新任务失败 - {str(e)}"


@tool
def complete_task(task_id: str) -> str:
    """完成任务。
    
    参数:
        task_id: 任务ID（必填）
    
    返回:
        完成结果
    """
    try:
        task = storage.complete_task(task_id)
        if task:
            return f"success:任务已完成！标题: {task.title}"
        return "error:任务不存在"
    except Exception as e:
        return f"error:完成任务失败 - {str(e)}"


@tool
def delete_task(task_id: str) -> str:
    """删除任务。
    
    参数:
        task_id: 任务ID（必填）
    
    返回:
        删除结果
    """
    try:
        success = storage.delete_task(task_id)
        if success:
            return "success:任务已删除"
        return "error:任务不存在"
    except Exception as e:
        return f"error:删除任务失败 - {str(e)}"


@tool
def get_projects() -> str:
    """获取所有项目列表。
    
    返回:
        项目列表信息
    """
    try:
        projects = storage.get_projects()
        if not projects:
            return "没有项目"
        
        result = "项目列表:\n"
        for p in projects:
            result += f"• {p.name} (ID: {p.id})\n"
        return result
    except Exception as e:
        return f"error:获取项目失败 - {str(e)}"


@tool
def get_current_time() -> str:
    """获取当前时间和日期。
    
    此工具用于获取系统的当前时间，帮助理解日期和时间上下文。
    在创建任务时，如果用户提到"今天"、"明天"、"后天"等相对日期，
    或者需要计算截止日期与当前时间的差距时，必须先调用此工具获取准确时间。
    
    返回:
        当前时间和日期信息，格式为ISO 8601格式
    """
    from datetime import datetime
    now = datetime.now()
    return f"""当前时间信息:
• 日期: {now.strftime('%Y年%m月%d日')}
• 时间: {now.strftime('%H:%M')}
• 星期: {now.strftime('%A')}
• ISO格式: {now.isoformat()}"""


tools = [
    create_task,
    get_tasks,
    search_tasks,
    get_task,
    update_task,
    complete_task,
    delete_task,
    get_projects,
    get_current_time
] + research_tools


class TaskAssistant:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="deepseek-chat",
            openai_api_key=DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com/v1",
            temperature=0.7
        )
        
        self.agent_executor = None
        self._init_agent()
        
    def _init_agent(self):
        prompt = """你是一个智能助手，帮助用户管理任务和进行科研工作。

=== 任务管理工具 ===
- create_task: 创建新任务
- get_tasks: 查询任务列表
- search_tasks: 根据关键词搜索任务
- get_task: 获取单个任务详情
- update_task: 更新任务信息
- complete_task: 完成任务
- delete_task: 删除任务
- get_projects: 获取项目列表
- get_current_time: 获取当前时间

=== 科研工具 ===
- save_research_keyword: 保存科研关键词
- get_research_keywords: 获取保存的科研关键词
- search_arxiv_papers: 在arXiv搜索学术论文
- search_semantic_scholar: 在Semantic Scholar搜索论文
- download_paper_pdf: 下载论文PDF
- save_paper_info: 保存论文信息到知识库
- get_saved_papers: 获取保存的论文列表
- read_paper_content: 读取论文内容
- summarize_paper: AI论文精读总结

重要规则：
1. 当用户提到"今天"、"明天"、"后天"等相对日期时，必须先调用 get_current_time 获取当前时间，然后计算准确的日期
2. 如果用户要修改/删除/完成任务，但只提供了任务描述而没有ID，必须先使用 search_tasks 搜索匹配的任务
3. 如果搜索到多个匹配结果，让用户选择具体是哪一个
4. 创建任务时，如果用户没有指定项目，默认使用 "inbox"
5. 如果用户没有指定优先级，默认优先级为 0（无）
6. 科研任务优先使用相关科研工具完成
"""
        
        self.system_prompt = prompt
        self.tools = tools
        agent = create_react_agent(self.llm, tools)
        self.agent_executor = agent
    
    async def process_stream(self, user_input: str):
        try:
            tool_steps = []
            final_output = ""
            
            async for event in self.agent_executor.astream_events(
                {"messages": [("user", user_input)]},
                version="v1"
            ):
                kind = event.get("event")
                
                if kind == "on_chat_model_stream":
                    content = event.get("data", {}).get("chunk", {}).content
                    if content:
                        yield {"type": "thinking", "content": content}
                
                elif kind == "on_tool_start":
                    tool_name = event.get("name", "unknown")
                    tool_steps.append(f"🔧 开始调用工具: {tool_name}")
                    yield {"type": "tool_start", "tool": tool_name}
                
                elif kind == "on_tool_end":
                    tool_name = event.get("name", "unknown")
                    output_obj = event.get("data", {}).get("output")
                    if hasattr(output_obj, "content"):
                        output = str(output_obj.content)
                    else:
                        output = str(output_obj)
                    tool_steps.append(f"🔧 工具 {tool_name} 返回:\n{output}")
                    yield {"type": "tool_end", "tool": tool_name, "result": output}
                
                elif kind == "on_agent_finish":
                    output_obj = event.get("data", {}).get("output")
                    if hasattr(output_obj, "content"):
                        final_output = str(output_obj.content)
                    else:
                        final_output = str(output_obj)
                    if final_output:
                        yield {"type": "final", "output": final_output}
            
            if not final_output:
                final_output = "没有返回结果"
            
            yield {"type": "done", "output": final_output, "steps": tool_steps}
            
        except Exception as e:
            yield {"type": "error", "error": str(e)}
    
    async def process(self, user_input: str):
        try:
            result = await self.agent_executor.ainvoke({"messages": [("user", user_input)]})
            
            messages = result.get("messages", [])
            
            tool_steps = []
            final_output = ""
            
            for msg in messages:
                if hasattr(msg, "type"):
                    if msg.type == "tool":
                        tool_name = getattr(msg, "name", "unknown")
                        content = getattr(msg, "content", "")
                        tool_steps.append(f"🔧 调用工具: {tool_name}\n{content[:200]}...")
                    elif msg.type == "ai" or msg.type == "human":
                        content = getattr(msg, "content", "")
                        if content:
                            final_output = content
            
            if not final_output:
                final_output = "没有返回结果"
            
            return {
                "output": final_output,
                "steps": tool_steps
            }
            
        except Exception as e:
            return {
                "output": f"处理请求时出错: {str(e)}",
                "steps": []
            }

    def process(self, user_input: str):
        return asyncio.run(self.process_async(user_input))
    
    async def process_async(self, user_input: str):
        try:
            result = await self.agent_executor.ainvoke({"messages": [("user", user_input)]})
            
            messages = result.get("messages", [])
            
            tool_steps = []
            final_output = ""
            
            for msg in messages:
                if hasattr(msg, "type"):
                    if msg.type == "tool":
                        tool_name = getattr(msg, "name", "unknown")
                        content = getattr(msg, "content", "")
                        tool_steps.append(f"🔧 调用工具: {tool_name}\n{content}")
                    elif msg.type == "ai" or msg.type == "human":
                        content = getattr(msg, "content", "")
                        if content:
                            final_output = content
            
            if not final_output:
                final_output = "没有返回结果"
            
            return {
                "output": final_output,
                "steps": tool_steps
            }
            
        except Exception as e:
            return {
                "output": f"处理请求时出错: {str(e)}",
                "steps": []
            }


assistant = TaskAssistant()


async def main():
    print("=" * 50)
    print("   TaskMate - AI 任务管理助手")
    print("=" * 50)
    print()
    print("我可以帮你管理任务！")
    print("请用自然语言告诉我你想做什么")
    print("（输入 'quit' 或 '退出' 结束）")
    print()

    while True:
        user_input = input("你: ").strip()

        if not user_input:
            continue

        if user_input.lower() in ["quit", "exit", "退出", "再见"]:
            print("\n助手: 再见！有需要随时找我。\n")
            break

        try:
            response = await assistant.process(user_input)
            print(f"\n助手: {response}\n")
        except Exception as e:
            print(f"\n错误: {str(e)}\n")


if __name__ == "__main__":
    asyncio.run(main())
