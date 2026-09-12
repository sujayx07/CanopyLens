import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers.analysis import router as analysis_router
from app.routers.health import router as health_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

_startup_logger = logging.getLogger("startup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Eagerly warm up ML models at startup so the first request is not cold.

    We catch all exceptions so the server can still boot in environments where
    models are not yet downloaded or a GPU is not available — the models will
    be loaded lazily on the first job request instead.
    """
    from app.services.pipeline import get_deepforest_model, get_sam2

    try:
        _startup_logger.info("preloading DeepForest model...")
        get_deepforest_model()
        _startup_logger.info("DeepForest model ready")
    except Exception as exc:  # noqa: BLE001
        _startup_logger.warning("DeepForest preload skipped (will load lazily): %s", exc)

    try:
        _startup_logger.info("preloading SAM2 model...")
        get_sam2()
        _startup_logger.info("SAM2 model ready")
    except Exception as exc:  # noqa: BLE001
        _startup_logger.warning("SAM2 preload skipped (will load lazily): %s", exc)

    _startup_logger.info(
        "CanopyLens API started — CORS origins: %s", settings.cors_origin_list
    )
    yield


app = FastAPI(
    title=settings.app_name,
    description=(
        "Tree-crown detection and canopy-cover analysis API. "
        "Upload an aerial/satellite image (GeoTIFF or JPEG/PNG) and optionally a KML "
        "boundary to restrict analysis to a specific area."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(analysis_router)


@app.get("/", tags=["root"])
async def root() -> dict[str, str]:
    return {"app": settings.app_name, "docs": "/docs"}