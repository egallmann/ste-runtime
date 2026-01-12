"""Greeting service for testing RECON extraction."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class GreetingConfig:
    """Configuration for greeting service."""
    prefix: str = "Hello"
    suffix: str = "!"


class GreetingService:
    """Service for generating greetings."""

    def __init__(self, config: Optional[GreetingConfig] = None):
        self.config = config or GreetingConfig()

    def greet(self, name: str) -> str:
        """Generate a greeting for the given name."""
        return f"{self.config.prefix}, {name}{self.config.suffix}"

    def formal_greet(self, title: str, name: str) -> str:
        """Generate a formal greeting."""
        return f"{self.config.prefix}, {title} {name}{self.config.suffix}"


def create_greeting_service(prefix: str = "Hello") -> GreetingService:
    """Factory function to create a greeting service."""
    config = GreetingConfig(prefix=prefix)
    return GreetingService(config)


