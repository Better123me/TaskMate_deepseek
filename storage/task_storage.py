import os
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path


class Task:
    def __init__(
        self,
        title: str,
        content: str = "",
        priority: int = 0,
        due_date: Optional[str] = None,
        start_date: Optional[str] = None,
        tags: List[str] = None,
        project_id: str = "inbox",
        task_id: Optional[str] = None,
        status: int = 0,
        created_at: Optional[str] = None,
        updated_at: Optional[str] = None
    ):
        self.id = task_id or self._generate_id()
        self.title = title
        self.content = content
        self.priority = priority
        self.due_date = due_date
        self.start_date = start_date
        self.tags = tags or []
        self.project_id = project_id
        self.status = status
        self.created_at = created_at or datetime.now().isoformat()
        self.updated_at = updated_at or datetime.now().isoformat()

    def _generate_id(self) -> str:
        import uuid
        return str(uuid.uuid4())[:8]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "priority": self.priority,
            "due_date": self.due_date,
            "start_date": self.start_date,
            "tags": self.tags,
            "project_id": self.project_id,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        return cls(
            title=data.get("title", ""),
            content=data.get("content", ""),
            priority=data.get("priority", 0),
            due_date=data.get("due_date"),
            start_date=data.get("start_date"),
            tags=data.get("tags", []),
            project_id=data.get("project_id", "inbox"),
            task_id=data.get("id"),
            status=data.get("status", 0),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at")
        )

    def mark_completed(self):
        self.status = 2
        self.updated_at = datetime.now().isoformat()

    def mark_active(self):
        self.status = 0
        self.updated_at = datetime.now().isoformat()


class Project:
    def __init__(
        self,
        name: str,
        color: str = "#4285F4",
        project_id: Optional[str] = None,
        kind: str = "task",
        view_mode: str = "list"
    ):
        self.id = project_id or self._generate_id()
        self.name = name
        self.color = color
        self.kind = kind
        self.view_mode = view_mode

    def _generate_id(self) -> str:
        import uuid
        return str(uuid.uuid4())[:8]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "kind": self.kind,
            "view_mode": self.view_mode
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Project":
        return cls(
            name=data.get("name", ""),
            color=data.get("color", "#4285F4"),
            project_id=data.get("id"),
            kind=data.get("kind", "task"),
            view_mode=data.get("view_mode", "list")
        )


class TaskStorage:
    def __init__(self, storage_path: Optional[str] = None):
        if storage_path is None:
            base_dir = Path(__file__).parent.parent
            storage_path = base_dir / "data" / "tasks.json"
        
        self.storage_path = Path(storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        
        self._tasks: Dict[str, Task] = {}
        self._projects: Dict[str, Project] = {}
        
        self._load()

    def _load(self):
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    tasks_data = data.get("tasks", {})
                    projects_data = data.get("projects", {})
                    
                    self._tasks = {k: Task.from_dict(v) for k, v in tasks_data.items()}
                    self._projects = {k: Project.from_dict(v) for k, v in projects_data.items()}
            except Exception as e:
                print(f"Error loading tasks: {e}")
                self._tasks = {}
                self._projects = {}
        else:
            self._projects = {
                "inbox": Project(name="Inbox", color="#4285F4", project_id="inbox"),
                "work": Project(name="Work", color="#EA4335", project_id="work"),
                "personal": Project(name="Personal", color="#34A853", project_id="personal")
            }
            self._save()

    def _save(self):
        data = {
            "tasks": {k: v.to_dict() for k, v in self._tasks.items()},
            "projects": {k: v.to_dict() for k, v in self._projects.items()}
        }
        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def create_task(
        self,
        title: str,
        content: str = "",
        priority: int = 0,
        due_date: Optional[str] = None,
        start_date: Optional[str] = None,
        tags: List[str] = None,
        project_id: str = "inbox"
    ) -> Task:
        task = Task(
            title=title,
            content=content,
            priority=priority,
            due_date=due_date,
            start_date=start_date,
            tags=tags,
            project_id=project_id
        )
        self._tasks[task.id] = task
        self._save()
        return task

    def get_task(self, task_id: str) -> Optional[Task]:
        return self._tasks.get(task_id)

    def get_tasks(
        self,
        project_id: Optional[str] = None,
        filter_type: str = "all"
    ) -> List[Task]:
        tasks = list(self._tasks.values())
        
        if project_id:
            tasks = [t for t in tasks if t.project_id == project_id]
        
        if filter_type == "active":
            tasks = [t for t in tasks if t.status != 2]
        elif filter_type == "completed":
            tasks = [t for t in tasks if t.status == 2]
        elif filter_type == "today":
            today = datetime.now().date().isoformat()
            tasks = [t for t in tasks if t.due_date and t.due_date.startswith(today)]
        elif filter_type == "overdue":
            now = datetime.now().isoformat()
            tasks = [t for t in tasks if t.due_date and t.due_date < now and t.status != 2]
        
        tasks.sort(key=lambda t: (-t.priority, t.created_at), reverse=True)
        return tasks

    def update_task(
        self,
        task_id: str,
        title: Optional[str] = None,
        content: Optional[str] = None,
        priority: Optional[int] = None,
        due_date: Optional[str] = None,
        is_completed: Optional[bool] = None
    ) -> Optional[Task]:
        task = self._tasks.get(task_id)
        if not task:
            return None
        
        if title is not None:
            task.title = title
        if content is not None:
            task.content = content
        if priority is not None:
            task.priority = priority
        if due_date is not None:
            task.due_date = due_date
        if is_completed is not None:
            task.status = 2 if is_completed else 0
        
        task.updated_at = datetime.now().isoformat()
        self._save()
        return task

    def complete_task(self, task_id: str) -> Optional[Task]:
        task = self._tasks.get(task_id)
        if task:
            task.mark_completed()
            self._save()
        return task

    def delete_task(self, task_id: str) -> bool:
        if task_id in self._tasks:
            del self._tasks[task_id]
            self._save()
            return True
        return False

    def get_projects(self) -> List[Project]:
        return list(self._projects.values())

    def get_project(self, project_id: str) -> Optional[Project]:
        return self._projects.get(project_id)

    def create_project(self, name: str, color: str = "#4285F4") -> Project:
        project = Project(name=name, color=color)
        self._projects[project.id] = project
        self._save()
        return project


storage = TaskStorage()
