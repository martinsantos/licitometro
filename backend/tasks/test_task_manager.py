from task_manager import TaskManager
import sys

def main():
    # Crear una instancia del TaskManager
    task_manager = TaskManager()

    print("Creando tareas de prueba...")

    # Crear algunas tareas
    task1 = task_manager.create_task(
        title="Implementar sistema de gestión de tareas",
        description="Crear un sistema básico para gestionar tareas con Python"
    )
    print(f"Tarea creada: {task1}")

    task2 = task_manager.create_task(
        title="Escribir documentación",
        description="Documentar el sistema de gestión de tareas"
    )
    print(f"Tarea creada: {task2}")

    # Actualizar el estado de una tarea
    print(f"\nActualizando estado de la tarea 1...")
    task_manager.update_task_status(task_id=1, new_status="Completed")
    updated_task = task_manager.get_task(task_id=1)
    print(f"Tarea actualizada: {updated_task}")

    # Obtener todas las tareas
    print("\nLista de todas las tareas:")
    all_tasks = task_manager.get_all_tasks()
    for task in all_tasks:
        print(task)

    # Obtener tareas por estado
    print("\nTareas pendientes:")
    pending_tasks = task_manager.get_tasks_by_status("Pending")
    for task in pending_tasks:
        print(task)

if __name__ == "__main__":
    main()
