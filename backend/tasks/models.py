from datetime import datetime
from typing import Optional

class Task:
    def __init__(self, id: int, title: str, description: Optional[str] = None,
                 status: str = "Pending", due_date: Optional[datetime] = None):
        self.id = id
        self.title = title
        self.description = description
        self.status = status  # Pending, In Progress, Completed, Cancelled
        self.due_date = due_date
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def update_status(self, new_status: str):
        self.status = new_status
        self.updated_at = datetime.now()

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }
