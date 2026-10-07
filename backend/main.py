from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.analysis.taxonomy import RULES
from backend.models import BatchRequest, DashboardRequest, GlobalRequest, PageRequest
from backend.providers.catalog import CatalogProvider
from backend.providers.centralauth import CentralAuthProvider
from backend.providers.dashboard import DashboardProvider
from backend.providers.mediawiki import MediaWikiContributionsProvider
from backend.providers.transport import SourceError, Transport, make_client
from backend.providers.xtools import XToolsGlobalContributionsProvider


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with make_client() as client:
        app.state.transport = Transport(client)
        yield


app = FastAPI(title="Rétention Wikimédia", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def privacy(request: Request, call_next):
    try:
        length = int(request.headers.get("content-length", "0"))
    except ValueError:
        return JSONResponse({"detail": "Requête invalide"}, status_code=400)
    if length > 1_000_000:
        return JSONResponse({"detail": "Requête trop volumineuse"}, status_code=413)
    if request.method == "POST":
        body = await request.body()
        if len(body) > 1_000_000:
            return JSONResponse({"detail": "Requête trop volumineuse"}, status_code=413)
    response = await call_next(request)
    response.headers["Cache-Control"] = (
        "no-store" if request.url.path.startswith("/api/") else "no-cache"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    )
    return response


@app.exception_handler(SourceError)
async def source_error(request: Request, error: SourceError):
    return JSONResponse(
        {
            "detail": "La source publique ne répond pas. Les autres données restent disponibles.",
            "provider": error.provider,
            "retry_after": error.retry_after,
            "source_status": error.status,
        },
        status_code=503 if error.status != 404 else 404,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    # Default Pydantic errors contain the submitted usernames; do not echo them.
    return JSONResponse(
        {"detail": "Vérifiez les noms de compte, le projet et les dates."}, status_code=422
    )


@app.exception_handler(ValueError)
async def value_error(request: Request, error: ValueError):
    return JSONResponse({"detail": "URL, projet ou paramètres invalides."}, status_code=422)


@app.exception_handler(KeyError)
async def schema_error(request: Request, error: KeyError):
    return JSONResponse(
        {"detail": "Le format de la source publique est indisponible."}, status_code=502
    )


def providers(request: Request):
    transport = request.app.state.transport
    catalog = CatalogProvider(transport)
    return transport, catalog


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "methodology": "1.0"}


@app.get("/api/taxonomy")
async def taxonomy():
    return RULES


@app.get("/api/projects")
async def projects(request: Request):
    return await providers(request)[1].catalog()


@app.post("/api/qualify")
async def qualify(body: BatchRequest, request: Request):
    return await CentralAuthProvider(providers(request)[0]).qualify(body.usernames)


@app.post("/api/local-accounts")
async def local_accounts(body: BatchRequest, request: Request):
    if len(body.usernames) != 1:
        raise ValueError("Un compte requis")
    return await CentralAuthProvider(providers(request)[0]).local_accounts(body.usernames[0])


@app.post("/api/dashboard")
async def dashboard(body: DashboardRequest, request: Request):
    return await DashboardProvider(providers(request)[0]).course(body.url)


@app.get("/api/namespaces/{project}")
async def namespaces(project: str, request: Request):
    transport, catalog = providers(request)
    return await MediaWikiContributionsProvider(transport, catalog).namespaces(project)


@app.post("/api/contributions")
async def contributions(body: PageRequest, request: Request):
    transport, catalog = providers(request)
    return await MediaWikiContributionsProvider(transport, catalog).page(body)


@app.post("/api/global-contributions")
async def global_contributions(body: GlobalRequest, request: Request):
    return await XToolsGlobalContributionsProvider(providers(request)[0]).page(body)


DIST = Path(__file__).parents[1] / "frontend/dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def frontend(path: str):
        return FileResponse(DIST / "index.html")
