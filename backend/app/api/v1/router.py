from fastapi import APIRouter
from app.api.v1 import auth, users, dashboard, products, shops, agent, suppliers, roles, publish, upload, facebook, scheduler_api, settings_api, xiaohongshu, gmc

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(dashboard.router)
api_router.include_router(products.router)
api_router.include_router(shops.router)
api_router.include_router(agent.router)
api_router.include_router(suppliers.router)
api_router.include_router(roles.router)
api_router.include_router(publish.router)
api_router.include_router(upload.router)
api_router.include_router(facebook.router)
api_router.include_router(scheduler_api.router)
api_router.include_router(settings_api.router)
api_router.include_router(xiaohongshu.router)
api_router.include_router(gmc.router)
