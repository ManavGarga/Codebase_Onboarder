import pytest
from app.ast_engine.parser import ast_manager
from app.ast_engine.extractors.symbol_extractor import symbol_extractor
from app.ast_engine.extractors.route_extractor import route_extractor
from app.ast_engine.extractors.dependency_extractor import dependency_extractor


def test_python_symbol_and_route_extraction():
    code = b"""
import os
from fastapi import FastAPI, Depends

app = FastAPI()

class UserService:
    \"\"\"Service for handling user accounts.\"\"\"
    def __init__(self, db):
        self.db = db

    def get_user_by_id(self, user_id: int) -> dict:
        return {"id": user_id, "name": "Alice"}

@app.get("/users/{user_id}")
def read_user(user_id: int):
    return {"user_id": user_id}
"""
    tree = ast_manager.parse_code(code, "python")
    assert tree is not None
    root = tree.root_node

    symbols = symbol_extractor.extract_symbols(root, "python", "service.py", code)
    assert len(symbols) >= 3

    class_sym = next((s for s in symbols if s.kind.value == "class"), None)
    assert class_sym is not None
    assert class_sym.name == "UserService"
    assert "handling user accounts" in (class_sym.docstring or "")

    method_sym = next((s for s in symbols if s.name == "get_user_by_id"), None)
    assert method_sym is not None
    assert method_sym.kind.value == "method"
    assert method_sym.parent_symbol == "UserService"

    routes = route_extractor.extract_routes(root, "python", "service.py", code)
    assert len(routes) == 1
    assert routes[0].http_method == "GET"
    assert routes[0].path == "/users/{user_id}"
    assert routes[0].handler_name == "read_user"


def test_typescript_symbol_and_route_extraction():
    code = b"""
import express, { Request, Response } from 'express';
import { Database } from './db';

const app = express();

export interface User {
  id: string;
  email: string;
}

export class AuthController {
  public async login(req: Request, res: Response): Promise<void> {
    res.json({ token: 'jwt-token' });
  }
}

app.post('/api/auth/login', (req, res) => {
  res.send('ok');
});
"""
    tree = ast_manager.parse_code(code, "typescript")
    assert tree is not None
    root = tree.root_node

    symbols = symbol_extractor.extract_symbols(root, "typescript", "auth.ts", code)
    assert len(symbols) >= 2

    iface_sym = next((s for s in symbols if s.kind.value == "interface"), None)
    assert iface_sym is not None
    assert iface_sym.name == "User"

    routes = route_extractor.extract_routes(root, "typescript", "auth.ts", code)
    assert len(routes) == 1
    assert routes[0].http_method == "POST"
    assert routes[0].path == "/api/auth/login"

    imports = dependency_extractor.extract_imports(root, "typescript", "auth.ts", code)
    assert len(imports) >= 2
    rel_imp = next((i for i in imports if i.is_relative), None)
    assert rel_imp is not None
    assert rel_imp.imported_module == "./db"
