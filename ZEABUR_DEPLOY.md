# TaskMate AI 科研助手 - Zeabur 部署指南

## 部署步骤

### 1. 准备 GitHub 仓库

将 `taskmate` 文件夹推送到 GitHub：

```bash
# 在 taskmate 目录下初始化 git（如果还没有）
git init
git add .
git commit -m "TaskMate AI 科研助手"

# 创建 GitHub 仓库并推送
git remote add origin https://github.com/你的用户名/TaskMate.git
git push -u origin main
```

### 2. 在 Zeabur 部署

1. 访问 https://zeabur.com
2. 点击 "Log in" → 使用 GitHub 登录
3. 点击 "New Project"
4. 选择 "Deploy from GitHub"
5. 选择刚才推送的 `TaskMate` 仓库
6. Zeabur 会自动识别为 Node.js 项目

### 3. 添加环境变量

在项目设置中添加：

| 变量名 | 值 |
|--------|-----|
| DEEPSEEK_API_KEY | 你的 DeepSeek API Key |

获取 API Key：https://platform.deepseek.com/

### 4. 部署完成

- 访问：`https://your-project.zeabur.app`
- 端口：3001（Zeabur 会自动设置 PORT 环境变量）

## 环境变量说明

Zeabur 会自动注入以下变量：
- `PORT`：端口号
- `DEEPSEEK_API_KEY`：你手动添加的

## 文件结构要求

确保仓库根目录包含：
```
taskmate/
├── server.js          # 主入口
├── package.json       # 依赖配置
├── public/            # 前端静态文件
└── data/              # 数据目录（可选提交）
```

## 注意事项

1. **数据持久化**：Zeabur 免费版重启后 `/tmp` 数据会丢失
2. **PDF下载**：下载的论文保存在服务器临时目录，重启会丢失
3. **API调用**：DeepSeek API 按调用次数计费
