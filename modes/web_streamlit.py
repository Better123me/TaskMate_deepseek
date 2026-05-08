import streamlit as st
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.task_agent import TaskAssistant


st.set_page_config(
    page_title="TaskMate - AI 科研助手",
    page_icon="🔬",
    layout="wide"
)

if "assistant" not in st.session_state:
    st.session_state.assistant = TaskAssistant()

if "messages" not in st.session_state:
    st.session_state.messages = []

st.title("🔬 TaskMate - AI 科研助手")
st.markdown("我可以帮你管理任务和进行科研工作！")

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

user_input = st.chat_input("请输入你的任务指令...")

if user_input:
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)
    
    with st.chat_message("assistant"):
        with st.spinner("AI 正在思考..."):
            result = st.session_state.assistant.process(user_input)
            
            if isinstance(result, dict):
                output = result.get("output", "没有返回结果")
                steps = result.get("steps", [])
                
                if steps:
                    st.markdown("---")
                    st.markdown("**思考过程：**")
                    for step in steps:
                        st.text(step)
                
                st.markdown("---")
                st.markdown(output)
                
                full_content = ""
                if steps:
                    full_content += "**思考过程：**\n\n" + "\n\n".join(steps) + "\n\n---\n\n"
                full_content += output
                st.session_state.messages.append({"role": "assistant", "content": full_content})
            else:
                st.markdown(result)
                st.session_state.messages.append({"role": "assistant", "content": result})

st.sidebar.title("💡 功能说明")
st.sidebar.markdown("""
### 📋 任务管理
- 创建任务：例如 "帮我创建一个任务"
- 查询任务：例如 "查看所有任务"
- 更新/删除/完成任务

### 🔬 科研功能
- 搜索论文：例如 "搜索大语言模型论文"
- 保存关键词：例如 "保存关键词：Transformer"
- 论文精读：例如 "精读这篇论文[标题]"

### 💡 重要规则
- 如果只提供任务描述而没有ID，会自动搜索匹配
- 科研任务使用免费API（arXiv、Semantic Scholar）
""")
