import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"Starting PocketAI Edge Service on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "app.server:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False
    )
