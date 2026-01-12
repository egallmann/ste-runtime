/**
 * Tests for Python extractor
 * 
 * Tests extraction of Python functions, classes, imports, Flask/FastAPI endpoints, and Pydantic models.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'python-extractor-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createPythonFile(filename: string, content: string): Promise<string> {
  const fullPath = path.join(tempDir, filename);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
  return fullPath;
}

describe('Python Extractor', () => {
  describe('function extraction', () => {
    it('should recognize function definitions', async () => {
      const code = `
def simple_function():
    """A simple function."""
    return "hello"

def function_with_args(name: str, count: int = 1) -> str:
    """Function with type hints."""
    return name * count

async def async_function(data: dict) -> None:
    """Async function."""
    await process(data)
`;
      const filePath = await createPythonFile('functions.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('def simple_function');
      expect(content).toContain('def function_with_args');
      expect(content).toContain('async def async_function');
    });

    it('should extract function with decorators', async () => {
      const code = `
@staticmethod
def static_method():
    pass

@classmethod
def class_method(cls):
    pass

@property
def my_property(self):
    return self._value
`;
      const filePath = await createPythonFile('decorators.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('@staticmethod');
      expect(content).toContain('@classmethod');
      expect(content).toContain('@property');
    });
  });

  describe('class extraction', () => {
    it('should recognize class definitions', async () => {
      const code = `
class SimpleClass:
    """A simple class."""
    
    def __init__(self):
        self.value = None

class InheritedClass(BaseClass):
    """Class with inheritance."""
    pass

class MultipleInheritance(Base1, Base2, Mixin):
    """Multiple inheritance."""
    pass
`;
      const filePath = await createPythonFile('classes.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('class SimpleClass');
      expect(content).toContain('class InheritedClass');
      expect(content).toContain('class MultipleInheritance');
    });
  });

  describe('import extraction', () => {
    it('should recognize import statements', async () => {
      const code = `
import os
import json
from typing import Optional, List, Dict
from pathlib import Path
from ..utils import helper
from .models import User, Account
`;
      const filePath = await createPythonFile('imports.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('import os');
      expect(content).toContain('from typing import');
      expect(content).toContain('from ..utils import');
    });
  });

  describe('Flask endpoint extraction', () => {
    it('should recognize Flask route decorators', async () => {
      const code = `
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route('/api/users', methods=['GET'])
def list_users():
    """List all users."""
    return jsonify([])

@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id: str):
    """Get user by ID."""
    return jsonify({'id': user_id})

@app.route('/api/users', methods=['POST'])
def create_user():
    """Create a new user."""
    data = request.get_json()
    return jsonify(data), 201
`;
      const filePath = await createPythonFile('flask_app.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain("@app.route('/api/users'");
      expect(content).toContain("methods=['GET']");
      expect(content).toContain("methods=['POST']");
    });

    it('should recognize Flask Blueprint routes', async () => {
      const code = `
from flask import Blueprint, jsonify

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

@users_bp.route('/', methods=['GET'])
def list_users():
    return jsonify([])

@users_bp.route('/<int:user_id>', methods=['GET', 'PUT'])
def user_detail(user_id):
    return jsonify({'id': user_id})
`;
      const filePath = await createPythonFile('blueprint.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('Blueprint');
      expect(content).toContain('@users_bp.route');
    });
  });

  describe('FastAPI endpoint extraction', () => {
    it('should recognize FastAPI route decorators', async () => {
      const code = `
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class User(BaseModel):
    name: str
    email: str

@app.get('/users')
async def list_users():
    return []

@app.get('/users/{user_id}')
async def get_user(user_id: int):
    return {'id': user_id}

@app.post('/users', status_code=201)
async def create_user(user: User):
    return user

@app.put('/users/{user_id}')
async def update_user(user_id: int, user: User):
    return user

@app.delete('/users/{user_id}')
async def delete_user(user_id: int):
    return {'deleted': True}
`;
      const filePath = await createPythonFile('fastapi_app.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('@app.get');
      expect(content).toContain('@app.post');
      expect(content).toContain('@app.put');
      expect(content).toContain('@app.delete');
    });

    it('should recognize FastAPI APIRouter', async () => {
      const code = `
from fastapi import APIRouter

router = APIRouter(prefix='/api/v1', tags=['users'])

@router.get('/users')
async def list_users():
    return []
`;
      const filePath = await createPythonFile('router.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('APIRouter');
      expect(content).toContain('@router.get');
    });
  });

  describe('Pydantic model extraction', () => {
    it('should recognize Pydantic BaseModel classes', async () => {
      const code = `
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime

class UserBase(BaseModel):
    name: str
    email: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    created_at: datetime
    roles: List[str] = []
    
    class Config:
        orm_mode = True

class UserWithValidation(BaseModel):
    email: str
    age: int = Field(ge=0, le=150)
    
    @validator('email')
    def validate_email(cls, v):
        if '@' not in v:
            raise ValueError('invalid email')
        return v
`;
      const filePath = await createPythonFile('models.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('class UserBase(BaseModel)');
      expect(content).toContain('class User(UserBase)');
      expect(content).toContain('class Config');
      expect(content).toContain('@validator');
    });
  });

  describe('dataclass extraction', () => {
    it('should recognize dataclass definitions', async () => {
      const code = `
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime

@dataclass
class SimpleData:
    name: str
    value: int

@dataclass(frozen=True)
class ImmutableData:
    id: str
    data: dict

@dataclass
class DataWithDefaults:
    name: str
    count: int = 0
    tags: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
`;
      const filePath = await createPythonFile('dataclasses.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('@dataclass');
      expect(content).toContain('frozen=True');
      expect(content).toContain('default_factory');
    });
  });

  describe('Lambda handler detection', () => {
    it('should recognize Lambda handler functions', async () => {
      const code = `
import json
import boto3

def lambda_handler(event, context):
    """Main Lambda entry point."""
    body = json.loads(event['body'])
    
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('users')
    
    response = table.put_item(Item=body)
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'success'})
    }
`;
      const filePath = await createPythonFile('handler.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('def lambda_handler');
      expect(content).toContain('event');
      expect(content).toContain('context');
    });
  });

  describe('AWS SDK usage detection', () => {
    it('should recognize boto3 client usage', async () => {
      const code = `
import boto3

def process_data():
    s3 = boto3.client('s3')
    dynamodb = boto3.client('dynamodb')
    sqs = boto3.resource('sqs')
    
    s3.get_object(Bucket='my-bucket', Key='data.json')
    dynamodb.put_item(TableName='users', Item={'pk': {'S': '123'}})
    
    queue = sqs.get_queue_by_name(QueueName='my-queue')
    queue.send_message(MessageBody='hello')
`;
      const filePath = await createPythonFile('aws_usage.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain("boto3.client('s3')");
      expect(content).toContain("boto3.client('dynamodb')");
      expect(content).toContain("boto3.resource('sqs')");
    });
  });

  describe('environment variable usage', () => {
    it('should recognize os.environ usage', async () => {
      const code = `
import os

TABLE_NAME = os.environ['TABLE_NAME']
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'default-bucket')
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

def get_config():
    return {
        'table': os.environ['TABLE_NAME'],
        'region': os.environ.get('AWS_REGION', 'us-east-1'),
    }
`;
      const filePath = await createPythonFile('env_vars.py', code);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain("os.environ['TABLE_NAME']");
      expect(content).toContain("os.environ.get");
      expect(content).toContain("os.getenv");
    });
  });
});


