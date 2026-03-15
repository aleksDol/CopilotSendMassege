from app.config import settings


def main() -> None:
    import uvicorn

    uvicorn.run(
        "app.api:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
