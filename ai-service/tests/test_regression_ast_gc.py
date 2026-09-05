import gc
import pytest
from app.ast_engine.parser import ast_manager
from app.ast_engine.extractors.symbol_extractor import symbol_extractor
from app.ast_engine.extractors.route_extractor import route_extractor
from app.ast_engine.extractors.model_extractor import model_extractor
from app.ast_engine.extractors.dependency_extractor import dependency_extractor
from app.models.schemas import SymbolDefinition, SymbolKind


def test_regression_ast_symbol_extraction_and_gc():
    """
    Regression Test:
    Ensures Tree-sitter AST parsing, symbol extraction, and cyclic garbage collection
    do not trigger segmentation faults on complex JavaScript AST structures (destructuring,
    closures, function declarations, property accesses) when Pydantic objects are allocated.
    """
    complex_js = b"""
    'use strict';
    var { METHODS } = require('node:http');
    var contentType = require('content-type');
    var etag = require('etag');

    exports.methods = METHODS.map((method) => method.toLowerCase());

    function createETagGenerator (options) {
      return function generateETag (body, encoding) {
        var buf = !Buffer.isBuffer(body) ? Buffer.from(body, encoding) : body;
        return etag(buf, options);
      };
    }

    function parseExtendedQueryString(str) {
      return qs.parse(str, {
        allowPrototypes: true
      });
    }

    class RequestHandler {
      constructor(app) {
        this.app = app;
      }

      handle(req, res) {
        return this.app.process(req, res);
      }
    }

    const asyncMiddleware = (req, res, next) => {
      next();
    };
    """

    tree = ast_manager.parse_code(complex_js, "javascript")
    assert tree is not None
    root_node = tree.root_node

    # 1. Extract symbols
    symbols = symbol_extractor.extract_symbols(root_node, "javascript", "lib/utils.js", complex_js)
    assert len(symbols) >= 4

    symbol_names = [s.name for s in symbols]
    assert "createETagGenerator" in symbol_names
    assert "parseExtendedQueryString" in symbol_names
    assert "RequestHandler" in symbol_names
    assert "asyncMiddleware" in symbol_names

    # 2. Extract dependencies
    deps = dependency_extractor.extract_imports(root_node, "javascript", "lib/utils.js", complex_js)
    assert len(deps) >= 3

    # 3. Verify cyclic garbage collection does not crash
    del tree, root_node
    gc.collect()
    gc.collect()

    assert True
