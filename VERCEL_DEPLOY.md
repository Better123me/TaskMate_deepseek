# TaskMate AI 科研助手 - Vercel 部署指南

## 部署到 Vercel

### 方式一：使用 Vercel CLI（推荐）

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 进入项目目录
cd d:\myScientificAgent\taskmate

# 3. 登录 Vercel（按提示操作）
vercel login

# 4. 部署（按提示选择配置）
vercel
```

### 方式二：使用 GitHub 部署

1. 将代码推送到 GitHub 仓库
2. 访问 https://vercel.com
3. 点击 "New Project" → 导入 GitHub 仓库
4. 配置环境变量：
   - `DEEPSEEK_API_KEY`: 你的 DeepSeek API Key

## 环境变量配置

在 Vercel 项目设置中添加：

| 变量名 | 值 |
|--------|-----|
| DEEPSEEK_API_KEY | 你的 DeepSeek API Key |

获取 API Key：https://platform.deepseek.com/

## 部署后

- 访问：`https://your-project.vercel.app`
- API Key 会自动从环境变量读取，不会暴露

## 注意事项

1. Vercel 免费额度：每月 100GB 流量
2. 无服务器环境：所有文件操作在 /tmp 目录，重启后数据丢失
3. 如需持久化存储，建议搭配数据库服务
