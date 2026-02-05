from typing import List, Dict, Optional
import uuid
from datetime import datetime
from .models import Task

class TaskManager:
    def __init__(self):
        self.tasks = {}
        self.next_id = 1

    def create_task(self, title: str, description: Optional[str] = None,
                    status: str = "Pending", due_date: Optional[datetime] = None) -> Dict:
        """Crear una nueva tarea"""
        task_id = self.next_id
        task = Task(
            id=task_id,
            title=title,
            description=description,
            status=status,
            due_date=due_date
        )
        self.tasks[task_id] = task
        self.next_id += 1
        return task.to_dict()

    def get_task(self, task_id: int) -> Optional[Dict]:
        """Obtener los detalles de una tarea por su ID"""
        if task_id in self.tasks:
            return self.tasks[task_id].to_dict()
        return None

    def get_all_tasks(self) -> List[Dict]:
        """Obtener todas las tareas"""
        return [task.to_dict() for task in self.tasks.values()]

    def update_task_status(self, task_id: int, new_status: str) -> bool:
        """Actualizar el estado de una tarea"""
        if task_id in self.tasks:
            self.tasks[task_id].update_status(new_status)
            return True
        return False

    def delete_task(self, task_id: int) -> bool:
        """Eliminar una tarea por su ID"""
        if task_id in self.tasks:
            del self.tasks[task_id]
            return True
        return False

    def get_tasks_by_status(self, status: str) -> List[Dict]:
        """Obtener todas las tareas con un estado específico"""
        return [task.to_dict() for task in self.tasks.values() if task.status == status]
