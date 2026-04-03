# ZNXP SaaS - AI 驱动的跨境电商选品平台 v2.0

## 项目结构

znxp-saas/
├── backend/     FastAPI 后端
├── frontend/    Nuxt 3 前端
└── docker-compose.yml

## 快速启动

后端:
cd backend && cp .env.example .env && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

前端:
cd frontend && npm install && npm run dev

API 文档: http://localhost:8000/docs
