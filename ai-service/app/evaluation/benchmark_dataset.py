from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class CitationRange:
    file_path: str
    start_line: int
    end_line: int


@dataclass
class BenchmarkCase:
    id: str
    category: str
    query: str
    expected_files: List[str]
    expected_symbols: List[str]
    expected_citations: List[CitationRange]
    expected_keywords: List[str]
    ground_truth_summary: str


BENCHMARK_DATASET: List[BenchmarkCase] = [
    # --------------------------------------------------------------------------
    # 1. FILE LOCATION (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="FL-01",
        category="file location",
        query="Where is the core Express application prototype defined?",
        expected_files=["lib/application.js"],
        expected_symbols=["app"],
        expected_citations=[CitationRange("lib/application.js", 1, 60)],
        expected_keywords=["application", "prototype", "express", "exports", "app"],
        ground_truth_summary="The core Express application prototype and constructor methods are defined in lib/application.js.",
    ),
    BenchmarkCase(
        id="FL-02",
        category="file location",
        query="Where is the HTTP response prototype and methods like res.send located?",
        expected_files=["lib/response.js"],
        expected_symbols=["res", "send"],
        expected_citations=[CitationRange("lib/response.js", 1, 100)],
        expected_keywords=["response", "res", "send", "prototype", "http"],
        ground_truth_summary="The response prototype containing res.send and response augmentations is implemented in lib/response.js.",
    ),
    BenchmarkCase(
        id="FL-03",
        category="file location",
        query="Where is the HTTP request prototype and header helpers located?",
        expected_files=["lib/request.js"],
        expected_symbols=["req", "get", "header"],
        expected_citations=[CitationRange("lib/request.js", 1, 100)],
        expected_keywords=["request", "req", "header", "prototype", "get"],
        ground_truth_summary="The request prototype containing request helpers like req.get and req.header is implemented in lib/request.js.",
    ),
    BenchmarkCase(
        id="FL-04",
        category="file location",
        query="Where is the top-level Express entrypoint and createApplication factory defined?",
        expected_files=["lib/express.js", "index.js"],
        expected_symbols=["createApplication"],
        expected_citations=[CitationRange("lib/express.js", 1, 80), CitationRange("index.js", 1, 15)],
        expected_keywords=["createApplication", "express", "exports", "entrypoint", "factory"],
        ground_truth_summary="Top-level entrypoint is in index.js which delegates to lib/express.js where createApplication factory is defined.",
    ),
    BenchmarkCase(
        id="FL-05",
        category="file location",
        query="Where is the template View rendering class implemented?",
        expected_files=["lib/view.js"],
        expected_symbols=["View"],
        expected_citations=[CitationRange("lib/view.js", 1, 80)],
        expected_keywords=["view", "render", "template", "engine", "lookup"],
        ground_truth_summary="The View class responsible for template lookup, engine loading, and rendering is located in lib/view.js.",
    ),

    # --------------------------------------------------------------------------
    # 2. SYMBOL LOCATION (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="SL-01",
        category="symbol location",
        query="Where is the compileETag function defined in Express?",
        expected_files=["lib/utils.js"],
        expected_symbols=["compileETag"],
        expected_citations=[CitationRange("lib/utils.js", 215, 245)],
        expected_keywords=["compileETag", "etag", "generator", "fn", "weak"],
        ground_truth_summary="compileETag is defined in lib/utils.js and compiles etag settings into generation functions.",
    ),
    BenchmarkCase(
        id="SL-02",
        category="symbol location",
        query="Where is the parseExtendedQueryString function implemented?",
        expected_files=["lib/utils.js"],
        expected_symbols=["parseExtendedQueryString"],
        expected_citations=[CitationRange("lib/utils.js", 260, 275)],
        expected_keywords=["parseExtendedQueryString", "qs", "parse", "allowPrototypes", "query"],
        ground_truth_summary="parseExtendedQueryString is implemented in lib/utils.js using qs.parse with allowPrototypes option.",
    ),
    BenchmarkCase(
        id="SL-03",
        category="symbol location",
        query="Where is the createETagGenerator function defined?",
        expected_files=["lib/utils.js"],
        expected_symbols=["createETagGenerator"],
        expected_citations=[CitationRange("lib/utils.js", 248, 258)],
        expected_keywords=["createETagGenerator", "generateETag", "buf", "Buffer", "etag"],
        ground_truth_summary="createETagGenerator is defined in lib/utils.js to produce etag hashing functions.",
    ),
    BenchmarkCase(
        id="SL-04",
        category="symbol location",
        query="Where is the acceptParams helper function located?",
        expected_files=["lib/utils.js"],
        expected_symbols=["acceptParams"],
        expected_citations=[CitationRange("lib/utils.js", 85, 120)],
        expected_keywords=["acceptParams", "quality", "params", "colonIndex", "value"],
        ground_truth_summary="acceptParams is located in lib/utils.js to parse HTTP Accept header parameters and quality values.",
    ),
    BenchmarkCase(
        id="SL-05",
        category="symbol location",
        query="Where is the Route class constructor and dispatch method located?",
        expected_files=["test/Route.js", "lib/router/route.js"],
        expected_symbols=["Route", "dispatch"],
        expected_citations=[CitationRange("test/Route.js", 1, 50)],
        expected_keywords=["Route", "dispatch", "stack", "methods", "path"],
        ground_truth_summary="The Route class and its dispatching mechanisms are exercised in test/Route.js and implemented in lib/router/route.js.",
    ),

    # --------------------------------------------------------------------------
    # 3. ARCHITECTURE (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="AR-01",
        category="architecture",
        query="How is the Express application decoupled from the routing mechanism?",
        expected_files=["lib/application.js", "lib/express.js"],
        expected_symbols=["app.lazyrouter", "app.handle"],
        expected_citations=[CitationRange("lib/application.js", 130, 170)],
        expected_keywords=["lazyrouter", "router", "Router", "middleware", "dispatch"],
        ground_truth_summary="Express uses lazy initialization (lazyrouter) in lib/application.js so routing and middleware dispatch are delegated to a separate Router instance.",
    ),
    BenchmarkCase(
        id="AR-02",
        category="architecture",
        query="How does Express manage application settings and environment configurations?",
        expected_files=["lib/application.js"],
        expected_symbols=["app.set", "app.get", "app.enable", "app.disable"],
        expected_citations=[CitationRange("lib/application.js", 350, 410)],
        expected_keywords=["settings", "set", "get", "env", "NODE_ENV"],
        ground_truth_summary="Express maintains an internal settings object on the app prototype with getter/setter helpers like app.set, app.get, app.enable, and app.disable.",
    ),
    BenchmarkCase(
        id="AR-03",
        category="architecture",
        query="How does Express handle view engine registration and template resolution?",
        expected_files=["lib/view.js", "lib/application.js"],
        expected_symbols=["View", "app.engine", "app.render"],
        expected_citations=[CitationRange("lib/view.js", 1, 100), CitationRange("lib/application.js", 520, 580)],
        expected_keywords=["engine", "render", "View", "lookup", "extension"],
        ground_truth_summary="Express registers template engines in app.engines via app.engine, and delegates template path resolution and rendering to the View class in lib/view.js.",
    ),
    BenchmarkCase(
        id="AR-04",
        category="architecture",
        query="How does Express delegate final unhandled HTTP requests or errors to the client?",
        expected_files=["lib/application.js"],
        expected_symbols=["app.handle", "finalhandler"],
        expected_citations=[CitationRange("lib/application.js", 150, 200)],
        expected_keywords=["finalhandler", "done", "out", "status", "unhandled"],
        ground_truth_summary="When all route layers are exhausted, app.handle invokes the finalhandler library to generate standard 404 or 500 HTTP responses.",
    ),
    BenchmarkCase(
        id="AR-05",
        category="architecture",
        query="How does Express structure the multi-router architecture in example applications?",
        expected_files=["examples/multi-router/index.js", "examples/multi-router/controllers/api_v1.js", "examples/multi-router/controllers/api_v2.js"],
        expected_symbols=["express.Router"],
        expected_citations=[CitationRange("examples/multi-router/index.js", 1, 40)],
        expected_keywords=["multi-router", "Router", "api_v1", "api_v2", "use"],
        ground_truth_summary="Express mounts isolated express.Router() instances under distinct subpaths (such as /api/v1 and /api/v2) using app.use().",
    ),

    # --------------------------------------------------------------------------
    # 4. IMPORTS (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="IM-01",
        category="imports",
        query="Which Node.js core modules are imported in lib/utils.js?",
        expected_files=["lib/utils.js"],
        expected_symbols=["METHODS", "Buffer"],
        expected_citations=[CitationRange("lib/utils.js", 15, 25)],
        expected_keywords=["node:http", "node:buffer", "node:querystring", "METHODS", "Buffer"],
        ground_truth_summary="lib/utils.js imports node:http (METHODS), node:buffer (Buffer), and node:querystring.",
    ),
    BenchmarkCase(
        id="IM-02",
        category="imports",
        query="What module does lib/utils.js import for generating ETag hashes?",
        expected_files=["lib/utils.js"],
        expected_symbols=["etag"],
        expected_citations=[CitationRange("lib/utils.js", 15, 25)],
        expected_keywords=["etag", "require", "createETagGenerator"],
        ground_truth_summary="lib/utils.js imports the external 'etag' package to generate HTTP entity tags.",
    ),
    BenchmarkCase(
        id="IM-03",
        category="imports",
        query="What library is imported in lib/utils.js for extended query string parsing?",
        expected_files=["lib/utils.js"],
        expected_symbols=["qs"],
        expected_citations=[CitationRange("lib/utils.js", 18, 24)],
        expected_keywords=["qs", "require", "parseExtendedQueryString"],
        ground_truth_summary="lib/utils.js imports 'qs' for nested/extended query string parsing.",
    ),
    BenchmarkCase(
        id="IM-04",
        category="imports",
        query="What package is imported for MIME type lookups in Express utility functions?",
        expected_files=["lib/utils.js"],
        expected_symbols=["mime"],
        expected_citations=[CitationRange("lib/utils.js", 15, 22)],
        expected_keywords=["mime-types", "mime", "require"],
        ground_truth_summary="lib/utils.js imports 'mime-types' as mime for content-type resolution.",
    ),
    BenchmarkCase(
        id="IM-05",
        category="imports",
        query="What module does lib/application.js import for HTTP server creation?",
        expected_files=["lib/application.js"],
        expected_symbols=["http.createServer"],
        expected_citations=[CitationRange("lib/application.js", 15, 30)],
        expected_keywords=["http", "node:http", "createServer", "listen"],
        ground_truth_summary="lib/application.js imports core 'http' module to instantiate servers in app.listen.",
    ),

    # --------------------------------------------------------------------------
    # 5. DEPENDENCIES (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="DP-01",
        category="dependencies",
        query="What is the declared package name and repository license in package.json?",
        expected_files=["package.json"],
        expected_symbols=[],
        expected_citations=[CitationRange("package.json", 1, 20)],
        expected_keywords=["express", "MIT", "name", "license"],
        ground_truth_summary="In package.json, the package name is 'express' and the license is 'MIT'.",
    ),
    BenchmarkCase(
        id="DP-02",
        category="dependencies",
        query="What testing framework and assertion libraries are configured in package.json devDependencies?",
        expected_files=["package.json"],
        expected_symbols=[],
        expected_citations=[CitationRange("package.json", 30, 70)],
        expected_keywords=["mocha", "supertest", "devDependencies"],
        ground_truth_summary="package.json lists mocha, supertest, and nyc as core devDependencies for testing and coverage.",
    ),
    BenchmarkCase(
        id="DP-03",
        category="dependencies",
        query="Which dependency in package.json is responsible for parsing cookie headers?",
        expected_files=["package.json"],
        expected_symbols=[],
        expected_citations=[CitationRange("package.json", 20, 60)],
        expected_keywords=["cookie", "cookie-signature", "dependencies"],
        ground_truth_summary="Express depends on 'cookie' and 'cookie-signature' for HTTP cookie parsing and signing.",
    ),
    BenchmarkCase(
        id="DP-04",
        category="dependencies",
        query="What dependency provides static file serving middleware used by Express?",
        expected_files=["package.json", "lib/express.js"],
        expected_symbols=["serveStatic"],
        expected_citations=[CitationRange("package.json", 25, 55)],
        expected_keywords=["serve-static", "static", "dependencies"],
        ground_truth_summary="Express bundles 'serve-static' to expose the express.static middleware.",
    ),
    BenchmarkCase(
        id="DP-05",
        category="dependencies",
        query="Which dependency in package.json handles content-type header negotiation?",
        expected_files=["package.json"],
        expected_symbols=[],
        expected_citations=[CitationRange("package.json", 20, 50)],
        expected_keywords=["content-type", "accepts", "type-is"],
        ground_truth_summary="Express specifies 'accepts', 'content-type', and 'type-is' in package.json for content negotiation.",
    ),

    # --------------------------------------------------------------------------
    # 6. API ROUTES (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="RT-01",
        category="API routes",
        query="What endpoints are registered in the content-negotiation example?",
        expected_files=["examples/content-negotiation/index.js"],
        expected_symbols=["app.get"],
        expected_citations=[CitationRange("examples/content-negotiation/index.js", 5, 45)],
        expected_keywords=["/", "/users", "get", "content-negotiation"],
        ground_truth_summary="The content-negotiation example registers GET / and GET /users with format-based responses.",
    ),
    BenchmarkCase(
        id="RT-02",
        category="API routes",
        query="What route handlers are configured in the hello-world example?",
        expected_files=["examples/hello-world/index.js"],
        expected_symbols=["app.get"],
        expected_citations=[CitationRange("examples/hello-world/index.js", 1, 20)],
        expected_keywords=["/", "Hello World", "app.get"],
        ground_truth_summary="examples/hello-world/index.js registers a single GET / route returning 'Hello World'.",
    ),
    BenchmarkCase(
        id="RT-03",
        category="API routes",
        query="What HTTP methods and routes are implemented in the resource example?",
        expected_files=["examples/resource/index.js"],
        expected_symbols=["app.resource", "app.get"],
        expected_citations=[CitationRange("examples/resource/index.js", 1, 40)],
        expected_keywords=["resource", "app.get", "GET", "/"],
        ground_truth_summary="The resource example defines RESTful resource mapping exposing endpoints for index, show, and update.",
    ),
    BenchmarkCase(
        id="RT-04",
        category="API routes",
        query="What routes are defined for user registration and session in the auth example?",
        expected_files=["examples/auth/index.js"],
        expected_symbols=["app.get", "app.post"],
        expected_citations=[CitationRange("examples/auth/index.js", 40, 90)],
        expected_keywords=["/login", "/logout", "GET", "POST", "auth"],
        ground_truth_summary="The auth example defines GET /login, POST /login, and GET /logout routes.",
    ),
    BenchmarkCase(
        id="RT-05",
        category="API routes",
        query="What download routes are configured in the downloads example?",
        expected_files=["examples/downloads/index.js"],
        expected_symbols=["app.get", "res.download"],
        expected_citations=[CitationRange("examples/downloads/index.js", 1, 35)],
        expected_keywords=["/files/:file", "res.download", "GET", "downloads"],
        ground_truth_summary="examples/downloads/index.js defines GET / and GET /files/:file(*)? to stream file downloads with res.download.",
    ),

    # --------------------------------------------------------------------------
    # 7. DATABASE MODELS (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="DB-01",
        category="database models",
        query="How does the MVC example simulate an in-memory database store?",
        expected_files=["examples/mvc/db.js"],
        expected_symbols=["pets", "users"],
        expected_citations=[CitationRange("examples/mvc/db.js", 1, 30)],
        expected_keywords=["users", "pets", "db", "mvc", "push"],
        ground_truth_summary="examples/mvc/db.js exports mock collections for users and pets with simulated relationships.",
    ),
    BenchmarkCase(
        id="DB-02",
        category="database models",
        query="How is the user record structured in the content-negotiation database mock?",
        expected_files=["examples/content-negotiation/db.js"],
        expected_symbols=["users"],
        expected_citations=[CitationRange("examples/content-negotiation/db.js", 1, 20)],
        expected_keywords=["name", "users", "id", "db"],
        ground_truth_summary="examples/content-negotiation/db.js defines a users list containing records with id and name properties.",
    ),
    BenchmarkCase(
        id="DB-03",
        category="database models",
        query="How does the session redis example configure session state storage?",
        expected_files=["examples/session/redis.js"],
        expected_symbols=["RedisStore", "session"],
        expected_citations=[CitationRange("examples/session/redis.js", 1, 40)],
        expected_keywords=["redis", "RedisStore", "session", "connect-redis"],
        ground_truth_summary="examples/session/redis.js uses connect-redis to configure RedisStore as the persistent backing store for express-session.",
    ),
    BenchmarkCase(
        id="DB-04",
        category="database models",
        query="How is data retrieved for a specific user ID in the MVC controllers?",
        expected_files=["examples/mvc/controllers/user/index.js"],
        expected_symbols=["users"],
        expected_citations=[CitationRange("examples/mvc/controllers/user/index.js", 1, 40)],
        expected_keywords=["user", "req.params.user_id", "users", "show"],
        ground_truth_summary="The user controller indexes the db.users collection using req.params.user_id or req.user loaded via param middleware.",
    ),
    BenchmarkCase(
        id="DB-05",
        category="database models",
        query="How does the cookie-sessions example persist session state across requests?",
        expected_files=["examples/cookie-sessions/index.js"],
        expected_symbols=["cookieSession"],
        expected_citations=[CitationRange("examples/cookie-sessions/index.js", 1, 30)],
        expected_keywords=["cookie-session", "req.session", "count", "views"],
        ground_truth_summary="examples/cookie-sessions/index.js uses cookie-session to serialize and encrypt state inside client cookies.",
    ),

    # --------------------------------------------------------------------------
    # 8. AUTHENTICATION (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="AU-01",
        category="authentication",
        query="How does the authentication example verify user credentials in authenticate()?",
        expected_files=["examples/auth/index.js"],
        expected_symbols=["authenticate"],
        expected_citations=[CitationRange("examples/auth/index.js", 10, 40)],
        expected_keywords=["authenticate", "hash", "crypto", "users", "pass"],
        ground_truth_summary="examples/auth/index.js implements an authenticate function that verifies submitted passwords against pbkdf2 hashes.",
    ),
    BenchmarkCase(
        id="AU-02",
        category="authentication",
        query="How does the restrict middleware guard private routes in the auth example?",
        expected_files=["examples/auth/index.js"],
        expected_symbols=["restrict"],
        expected_citations=[CitationRange("examples/auth/index.js", 35, 55)],
        expected_keywords=["restrict", "req.session.user", "redirect", "/login"],
        ground_truth_summary="The restrict middleware checks if req.session.user exists; if not, it redirects the client to /login.",
    ),
    BenchmarkCase(
        id="AU-03",
        category="authentication",
        query="How is session destruction handled upon user logout in the auth example?",
        expected_files=["examples/auth/index.js"],
        expected_symbols=["app.get"],
        expected_citations=[CitationRange("examples/auth/index.js", 70, 90)],
        expected_keywords=["logout", "destroy", "req.session.destroy", "redirect"],
        ground_truth_summary="The /logout route calls req.session.destroy() and redirects the user back to the homepage.",
    ),
    BenchmarkCase(
        id="AU-04",
        category="authentication",
        query="How are salt and hash generated for passwords in the auth example?",
        expected_files=["examples/auth/index.js"],
        expected_symbols=["hash"],
        expected_citations=[CitationRange("examples/auth/index.js", 15, 35)],
        expected_keywords=["crypto.pbkdf2", "salt", "hash", "pass"],
        ground_truth_summary="Password hashing uses crypto.pbkdf2 with a cryptographic salt to store salted hashes.",
    ),
    BenchmarkCase(
        id="AU-05",
        category="authentication",
        query="How does the route-middleware example enforce authorization checking?",
        expected_files=["examples/route-middleware/index.js"],
        expected_symbols=["loadUser", "andRestrictToSelf"],
        expected_citations=[CitationRange("examples/route-middleware/index.js", 1, 40)],
        expected_keywords=["loadUser", "andRestrictToSelf", "req.authenticatedUser", "Unauthorized"],
        ground_truth_summary="examples/route-middleware/index.js uses chained middleware functions loadUser and andRestrictToSelf to guard user resources.",
    ),

    # --------------------------------------------------------------------------
    # 9. FRONTEND/BACKEND FLOWS (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="FB-01",
        category="frontend/backend flows",
        query="How does Express render EJS views with dynamic variables in the ejs example?",
        expected_files=["examples/ejs/index.js"],
        expected_symbols=["app.engine", "res.render"],
        expected_citations=[CitationRange("examples/ejs/index.js", 1, 35)],
        expected_keywords=["ejs", "render", "users", "title", "views"],
        ground_truth_summary="examples/ejs/index.js sets ejs as the view engine and calls res.render('users', { users: users, title: 'Users' }).",
    ),
    BenchmarkCase(
        id="FB-02",
        category="frontend/backend flows",
        query="How are view locals passed to templates across all requests in view-locals example?",
        expected_files=["examples/view-locals/index.js"],
        expected_symbols=["app.use", "res.locals"],
        expected_citations=[CitationRange("examples/view-locals/index.js", 1, 40)],
        expected_keywords=["res.locals", "app.use", "middleware", "locals"],
        ground_truth_summary="examples/view-locals/index.js registers middleware assigning default properties onto res.locals for template access.",
    ),
    BenchmarkCase(
        id="FB-03",
        category="frontend/backend flows",
        query="How does the search example connect an HTML client with a backend search endpoint?",
        expected_files=["examples/search/index.js", "examples/search/public/client.js"],
        expected_symbols=["app.get", "search"],
        expected_citations=[CitationRange("examples/search/index.js", 1, 35)],
        expected_keywords=["/search/:query?", "search", "client.js", "fetch", "ajax"],
        ground_truth_summary="The client UI in search/public sends queries to GET /search/:query which queries backend memory and returns JSON.",
    ),
    BenchmarkCase(
        id="FB-04",
        category="frontend/backend flows",
        query="How does Express serve static CSS and client JS files in static-files example?",
        expected_files=["examples/static-files/index.js"],
        expected_symbols=["express.static"],
        expected_citations=[CitationRange("examples/static-files/index.js", 1, 30)],
        expected_keywords=["express.static", "public", "static", "serve-static"],
        ground_truth_summary="examples/static-files/index.js mounts express.static(path.join(__dirname, 'public')) to stream client assets.",
    ),
    BenchmarkCase(
        id="FB-05",
        category="frontend/backend flows",
        query="How does the error-pages example render custom 404 and 500 error views?",
        expected_files=["examples/error-pages/index.js"],
        expected_symbols=["app.use"],
        expected_citations=[CitationRange("examples/error-pages/index.js", 15, 55)],
        expected_keywords=["404", "500", "res.status", "res.render", "error_header"],
        ground_truth_summary="Custom error pages are rendered by catching unhandled requests in a 404 middleware and error-handling middleware rendering '500'.",
    ),

    # --------------------------------------------------------------------------
    # 10. EXECUTION FLOWS (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="EF-01",
        category="execution flows",
        query="What is the execution order of Express middleware registered via app.use?",
        expected_files=["lib/application.js", "test/app.use.js"],
        expected_symbols=["app.use", "next"],
        expected_citations=[CitationRange("lib/application.js", 180, 230)],
        expected_keywords=["app.use", "stack", "sequential", "order", "next"],
        ground_truth_summary="Middleware registered via app.use are appended to the router stack and executed sequentially in registration order as each calls next().",
    ),
    BenchmarkCase(
        id="EF-02",
        category="execution flows",
        query="How does Express distinguish error-handling middleware from normal middleware?",
        expected_files=["lib/application.js", "test/middleware.basic.js"],
        expected_symbols=["handle_error", "length"],
        expected_citations=[CitationRange("test/middleware.basic.js", 1, 40)],
        expected_keywords=["err, req, res, next", "arity", "length === 4", "error-handling"],
        ground_truth_summary="Express inspects function arity (fn.length === 4); functions with 4 parameters (err, req, res, next) are executed only when an error is passed to next(err).",
    ),
    BenchmarkCase(
        id="EF-03",
        category="execution flows",
        query="What happens when next('route') is called inside a route handler?",
        expected_files=["test/Route.js", "test/app.route.js"],
        expected_symbols=["next", "route"],
        expected_citations=[CitationRange("test/Route.js", 10, 60)],
        expected_keywords=["next('route')", "bypass", "skip", "Route"],
        ground_truth_summary="Calling next('route') bypasses the remaining middleware callbacks on the current Route and transfers control to the next route in the Router stack.",
    ),
    BenchmarkCase(
        id="EF-04",
        category="execution flows",
        query="How does param middleware execution flow work with app.param?",
        expected_files=["test/app.param.js"],
        expected_symbols=["app.param"],
        expected_citations=[CitationRange("test/app.param.js", 1, 50)],
        expected_keywords=["param", "app.param", "id", "callback", "next"],
        ground_truth_summary="app.param registers parameter-preprocessing callbacks that execute once per request when a matching route parameter is present.",
    ),
    BenchmarkCase(
        id="EF-05",
        category="execution flows",
        query="How does res.send handle different data types (Buffer, String, Object, Boolean)?",
        expected_files=["lib/response.js"],
        expected_symbols=["res.send", "res.json"],
        expected_citations=[CitationRange("lib/response.js", 100, 200)],
        expected_keywords=["send", "Buffer", "string", "json", "content-type"],
        ground_truth_summary="res.send checks typeof chunk; objects are delegated to res.json, strings set text/html default, and Buffers set application/octet-stream.",
    ),

    # --------------------------------------------------------------------------
    # 11. IMPACT ANALYSIS (5 cases)
    # --------------------------------------------------------------------------
    BenchmarkCase(
        id="IA-01",
        category="impact analysis",
        query="What is the blast radius if exports.etag in lib/utils.js is modified?",
        expected_files=["lib/utils.js", "lib/application.js", "lib/response.js"],
        expected_symbols=["etag", "compileETag"],
        expected_citations=[CitationRange("lib/utils.js", 35, 55)],
        expected_keywords=["etag", "lib/response.js", "lib/application.js", "blast radius", "res.send"],
        ground_truth_summary="Modifying exports.etag in lib/utils.js directly impacts response ETag generation in lib/response.js and app-level etag configuration in lib/application.js.",
    ),
    BenchmarkCase(
        id="IA-02",
        category="impact analysis",
        query="What components are affected if the compileETag function in lib/utils.js changes its signature?",
        expected_files=["lib/utils.js", "lib/application.js"],
        expected_symbols=["compileETag", "app.defaultConfiguration"],
        expected_citations=[CitationRange("lib/utils.js", 215, 240)],
        expected_keywords=["compileETag", "app.set", "defaultConfiguration", "etag"],
        ground_truth_summary="Changing compileETag signature impacts lib/application.js where compileETag is invoked during application initialization.",
    ),
    BenchmarkCase(
        id="IA-03",
        category="impact analysis",
        query="What downstream callers are impacted by changing parseExtendedQueryString in lib/utils.js?",
        expected_files=["lib/utils.js", "lib/application.js"],
        expected_symbols=["parseExtendedQueryString", "compileQueryParser"],
        expected_citations=[CitationRange("lib/utils.js", 260, 275)],
        expected_keywords=["parseExtendedQueryString", "query parser", "req.query", "lib/application.js"],
        ground_truth_summary="Altering parseExtendedQueryString affects query parsing setup in lib/application.js and downstream req.query in all handlers.",
    ),
    BenchmarkCase(
        id="IA-04",
        category="impact analysis",
        query="What is the blast radius of modifying res.send in lib/response.js?",
        expected_files=["lib/response.js", "lib/application.js"],
        expected_symbols=["res.send", "res.json"],
        expected_citations=[CitationRange("lib/response.js", 100, 200)],
        expected_keywords=["res.send", "endpoints", "routes", "status", "headers"],
        ground_truth_summary="res.send is the fundamental output mechanism in Express; modifying it impacts all API routes and callers in the application.",
    ),
    BenchmarkCase(
        id="IA-05",
        category="impact analysis",
        query="What components are affected if the View constructor in lib/view.js changes parameter requirements?",
        expected_files=["lib/view.js", "lib/application.js"],
        expected_symbols=["View", "app.render"],
        expected_citations=[CitationRange("lib/view.js", 20, 60), CitationRange("lib/application.js", 530, 570)],
        expected_keywords=["View", "app.render", "res.render", "template"],
        ground_truth_summary="Changes to View impact app.render in lib/application.js and all downstream res.render template invocations.",
    ),
]
