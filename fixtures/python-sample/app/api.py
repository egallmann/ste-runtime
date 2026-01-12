"""Flask API endpoints for testing RECON extraction."""

from flask import Flask, jsonify, request
from app.services.user_service import UserService, User
from app.services.greeting import GreetingService

app = Flask(__name__)
user_service = UserService()
greeting_service = GreetingService()


@app.route('/api/users', methods=['GET'])
def list_users():
    """List all users."""
    users = user_service.list_users()
    return jsonify([{'id': u.id, 'name': u.name, 'email': u.email} for u in users])


@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id: str):
    """Get a user by ID."""
    user = user_service.get_user(user_id)
    if user:
        return jsonify({'id': user.id, 'name': user.name, 'email': user.email})
    return jsonify({'error': 'User not found'}), 404


@app.route('/api/users', methods=['POST'])
def create_user():
    """Create a new user."""
    data = request.get_json()
    user = user_service.create_user(
        id=data['id'],
        name=data['name'],
        email=data['email']
    )
    return jsonify({'id': user.id, 'name': user.name, 'email': user.email}), 201


@app.route('/api/greet/<name>', methods=['GET'])
def greet(name: str):
    """Greet a user by name."""
    message = greeting_service.greet(name)
    return jsonify({'message': message})


if __name__ == '__main__':
    app.run(debug=True)


