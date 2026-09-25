from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routes import auth, day_logs, goals

settings = get_settings()

# Em produção a API não expõe a documentação interativa.
app = FastAPI(
    title="Day UP API",
    version="0.1.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[settings.csrf_header_name],
)

app.include_router(auth.router)
app.include_router(goals.router)
app.include_router(day_logs.router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Mesmo formato do 422 padrão do FastAPI, mas sem `input`/`ctx` (nunca ecoar o
    valor enviado — evita vazar senha em log/resposta) e sem o prefixo "Value error, "
    que os validadores customizados (@field_validator) adicionam à mensagem."""
    errors = []
    for error in exc.errors():
        cleaned = {k: v for k, v in error.items() if k not in ("input", "ctx")}
        msg = cleaned.get("msg")
        if isinstance(msg, str) and msg.startswith("Value error, "):
            cleaned["msg"] = msg.removeprefix("Value error, ")
        errors.append(cleaned)
    return JSONResponse(status_code=422, content={"detail": errors})


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
