from dataclasses import dataclass
from flask import Flask

app = Flask(__name__)


@app.route("/ping", methods=["GET"])
def ping():
    """Simple healthcheck endpoint."""
    return "pong"


@app.route("/items", methods=["POST"])
def create_item():
    """Create item endpoint."""
    return {"status": "created"}


@dataclass
class User:
    """Example data model."""

    id: int
    name: str = "anonymous"


class Greeter:
    """Simple class with a method."""

    def greet(self, who: str) -> str:
        return f"Hello {who}"

