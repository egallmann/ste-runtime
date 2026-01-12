"""User service for testing RECON extraction."""

from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime


@dataclass
class User:
    """User entity model."""
    id: str
    name: str
    email: str
    created_at: datetime = field(default_factory=datetime.now)
    roles: List[str] = field(default_factory=list)


class UserService:
    """Service for managing users."""

    def __init__(self):
        self._users: dict[str, User] = {}

    def create_user(self, id: str, name: str, email: str) -> User:
        """Create a new user."""
        user = User(id=id, name=name, email=email)
        self._users[id] = user
        return user

    def get_user(self, id: str) -> Optional[User]:
        """Get a user by ID."""
        return self._users.get(id)

    def list_users(self) -> List[User]:
        """List all users."""
        return list(self._users.values())

    def delete_user(self, id: str) -> bool:
        """Delete a user by ID."""
        if id in self._users:
            del self._users[id]
            return True
        return False


