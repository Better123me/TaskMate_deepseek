# TaskMate - AI 任务管理助手

基于 LangChain + DeepSeek 的智能任务管理助手，通过 MCP（模型上下文协议）集成滴答清单(TickTick)作为任务存储后端。

## 功能特性

- **自然语言任务管理**：使用自然语言添加、删除、修改和查询任务
- **任务智能拆分**：将大型任务自动拆分为可执行的子任务
- **优先级排序**：根据截止时间和重要性自动排序任务
- **执行建议**：每天获取任务执行建议
- **双模式交互**：支持终端命令行和 Web 可视化界面

## 环境配置

1. 复制 `.env.example` 为 `.env` 并填入配置：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here

DIDA365_SERVICE_TYPE=ticktick
DIDA365_CLIENT_ID=your_client_id
DIDA365_CLIENT_SECRET=your_client_secret
DIDA365_ACCESS_TOKEN=your_access_token
```

### 获取 API 凭证

#### DeepSeek API Key
访问 [DeepSeek 开放平台](https://platform.deepseek.com/) 注册并获取 API Key

#### 滴答清单 API 凭证

**方式一：使用 Access Token（推荐）**
1. 访问 [滴答清单开发者平台](https://developer.ticktick.com/manage) 或 [滴答清单国内版](https://developer.dida365.com/manage)
2. 创建新应用，获取 Client ID 和 Client Secret
3. 使用 SDK 获取 Access Token（首次运行时会自动引导授权）

**方式二：OAuth2 授权**
1. 创建应用时设置 Redirect URI 为 `http://localhost:8080/callback`
2. 运行程序后将自动打开浏览器进行授权
3. 授权完成后 Token 会自动保存到 .env 文件

## 安装依赖

```bash
cd taskmate
pip install -r requirements.txt
```

## 使用方法

### 方式一：通过主入口启动

```bash
cd taskmate
python main.py
```

根据提示选择运行模式：
- 输入 `1` 进入终端模式
- 输入 `2` 进入 Web 界面模式

### 方式二：直接运行特定模式

**终端模式：**
```bash
python -m modes.terminal
```

**Web 界面模式：**
```bash
streamlit run modes/web_streamlit.py
```

## 使用示例

### 添加任务
```
帮我添加一个任务：明天下午3点前提交项目报告
```

### 查看任务
```
把我所有未完成的任务按紧急程度排序
```

### 删除任务
```
删除今天已经完成的任务
```

### 任务拆分
```
把'写文献综述'这个任务拆分成几个子任务
```

### 执行建议
```
给我今天的执行建议
```

## 项目结构

```
taskmate/
├── .env                    # 环境变量配置
├── requirements.txt        # Python 依赖
├── main.py                 # 程序入口
├── mcp_server/
│   └── ticktick_mcp.py    # 滴答清单 MCP Server
├── agent/
│   └── task_agent.py      # LangChain Agent 逻辑
└── modes/
    ├── terminal.py        # 终端交互模式
    └── web_streamlit.py   # Streamlit Web 界面
```

## 技术栈

- **语言**: Python 3.10+
- **核心框架**: LangChain
- **LLM**: DeepSeek (deepseek-chat)
- **任务后端**: 滴答清单(TickTick) API
- **MCP**: Model Context Protocol
- **Web 界面**: Streamlit

## 注意事项

1. 确保网络可以访问 DeepSeek API 和滴答清单 API
2. 滴答清单 API 凭证需要从滴答清单开发者平台获取
3. 首次启动时需要较长时间初始化智能体
