from typing import List

from pydantic import BaseModel


class AdminTestCaseOut(BaseModel):
    id: str
    title: str
    area: str
    health: str
    status: str
    summary: str
    source_file: str
    source_test: str
    commands: List[str]
    covered_paths: List[str]
