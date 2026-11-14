from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health(request: Request) -> dict[str, str | int]:
    return {"status": "ok", "forecast_rows": len(request.app.state.forecast.flights)}
