from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, users, rooms

app = FastAPI(
    title="StudioBookingSoftware",
    version="0.1.0",
    description="Room booking platform for studios"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["[localhost](http://localhost:3000)"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(rooms.router)

@app.get("/health")
def health():
    return {"status": "ok", "service": "StudioBookingSoftware"}
