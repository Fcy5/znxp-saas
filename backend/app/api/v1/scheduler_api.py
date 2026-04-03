from fastapi import APIRouter, BackgroundTasks
from app.core.deps import CurrentUser
from app.scheduler import _scheduler, job_shopify, job_tiktok, job_fb, job_google

router = APIRouter(prefix="/scheduler", tags=["Scheduler"])

JOB_FN = {
    "shopify": job_shopify,
    "tiktok": job_tiktok,
    "fb": job_fb,
    "google": job_google,
}


@router.get("/jobs")
async def list_jobs(current_user_id: CurrentUser):
    """查看所有定时任务及下次执行时间"""
    if not _scheduler or not _scheduler.running:
        return {"running": False, "jobs": []}
    jobs = [
        {
            "id": job.id,
            "name": job.name,
            "next_run_time": str(job.next_run_time),
        }
        for job in _scheduler.get_jobs()
    ]
    return {"running": True, "jobs": jobs}


@router.post("/run/{job_id}")
async def run_job_now(job_id: str, background_tasks: BackgroundTasks, current_user_id: CurrentUser):
    """立即触发某个爬虫任务（后台运行）"""
    fn = JOB_FN.get(job_id)
    if not fn:
        return {"success": False, "message": f"未知任务: {job_id}，可选: {list(JOB_FN.keys())}"}
    background_tasks.add_task(fn)
    return {"success": True, "message": f"任务 [{job_id}] 已在后台启动"}
