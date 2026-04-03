from fastapi import APIRouter
from app.core.deps import CurrentUser
from app.schemas.common import Response

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("/", response_model=Response[list])
async def list_roles(current_user_id: CurrentUser):
    """角色列表"""
    # TODO: 查询 Role 表
    return Response(data=[{"id": 1, "name": "admin"}, {"id": 2, "name": "user"}])
