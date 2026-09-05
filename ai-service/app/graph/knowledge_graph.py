from typing import List, Dict, Set, Any
from collections import defaultdict, deque
from app.models.schemas import (
    KnowledgeGraphData,
    GraphNode,
    GraphEdge,
    GraphNodeType,
    SymbolDefinition,
    RouteDefinition,
    DatabaseModelDefinition,
    ImportRelationship,
)


class KnowledgeGraphBuilder:
    """
    Constructs an interactive, typed structural knowledge graph
    connecting files, symbols, routes, database models, and dependencies.
    """

    def build_graph(
        self,
        repository_id: str,
        files: List[str],
        symbols: List[SymbolDefinition],
        routes: List[RouteDefinition],
        models: List[DatabaseModelDefinition],
        imports: List[ImportRelationship],
    ) -> KnowledgeGraphData:
        nodes: List[GraphNode] = []
        edges: List[GraphEdge] = []
        node_ids: Set[str] = set()

        def add_node(node: GraphNode):
            if node.id not in node_ids:
                node_ids.add(node.id)
                nodes.append(node)

        # 1. Add File Nodes
        for f in files:
            add_node(
                GraphNode(
                    id=f"file:{f}",
                    label=f.split("/")[-1],
                    type=GraphNodeType.FILE,
                    file_path=f,
                    data={"full_path": f, "extension": f.split(".")[-1] if "." in f else ""},
                )
            )

        # 2. Add Route Nodes & Edges (Route -> File / Handler)
        for r in routes:
            route_node_id = f"route:{r.http_method}:{r.path}"
            add_node(
                GraphNode(
                    id=route_node_id,
                    label=f"{r.http_method} {r.path}",
                    type=GraphNodeType.ROUTE,
                    file_path=r.file_path,
                    data={
                        "http_method": r.http_method,
                        "path": r.path,
                        "framework": r.framework,
                        "start_line": r.start_line,
                        "handler": r.handler_name,
                    },
                )
            )
            # Edge: Route defined in File
            edges.append(
                GraphEdge(
                    id=f"e:route_in_file:{route_node_id}->file:{r.file_path}",
                    source=route_node_id,
                    target=f"file:{r.file_path}",
                    label="DEFINED_IN",
                    data={"kind": "route_definition"},
                )
            )

        # 3. Add Database Model Nodes & Edges
        for m in models:
            model_node_id = f"model:{m.model_name}"
            add_node(
                GraphNode(
                    id=model_node_id,
                    label=f"Model: {m.model_name}",
                    type=GraphNodeType.MODEL,
                    file_path=m.file_path,
                    data={
                        "model_name": m.model_name,
                        "orm": m.orm_type,
                        "table_name": m.table_name,
                        "fields_count": len(m.fields),
                        "start_line": m.start_line,
                    },
                )
            )
            edges.append(
                GraphEdge(
                    id=f"e:model_in_file:{model_node_id}->file:{m.file_path}",
                    source=model_node_id,
                    target=f"file:{m.file_path}",
                    label="SCHEMA_IN",
                    data={"kind": "model_definition"},
                )
            )

        # 4. Add Symbol Nodes (Classes & major functions)
        for s in symbols:
            # Only add classes and exported/standalone functions to keep graph performant and readable
            if s.kind.value in ("class", "interface") or (s.kind.value == "function" and not s.parent_symbol):
                sym_node_id = f"sym:{s.name}:{s.file_path}"
                node_type = GraphNodeType.CLASS if s.kind.value in ("class", "interface") else GraphNodeType.FUNCTION
                add_node(
                    GraphNode(
                        id=sym_node_id,
                        label=f"{s.kind.value.capitalize()}: {s.name}",
                        type=node_type,
                        file_path=s.file_path,
                        data={
                            "name": s.name,
                            "kind": s.kind.value,
                            "signature": s.signature,
                            "start_line": s.start_line,
                            "end_line": s.end_line,
                        },
                    )
                )
                edges.append(
                    GraphEdge(
                        id=f"e:defines:file:{s.file_path}->{sym_node_id}",
                        source=f"file:{s.file_path}",
                        target=sym_node_id,
                        label="DECLARES",
                    )
                )

        # 5. Add Import Relationships
        for imp in imports:
            source_file_id = f"file:{imp.source_file}"
            if imp.resolved_target_file:
                target_file_id = f"file:{imp.resolved_target_file}"
                edges.append(
                    GraphEdge(
                        id=f"e:imp:{source_file_id}->{target_file_id}",
                        source=source_file_id,
                        target=target_file_id,
                        label="IMPORTS",
                        data={"symbols": imp.imported_symbols},
                    )
                )
            elif not imp.is_relative:
                # External package node
                pkg_id = f"pkg:{imp.imported_module}"
                add_node(
                    GraphNode(
                        id=pkg_id,
                        label=f"Package: {imp.imported_module}",
                        type=GraphNodeType.PACKAGE,
                        data={"package_name": imp.imported_module},
                    )
                )
                edges.append(
                    GraphEdge(
                        id=f"e:pkg:{source_file_id}->{pkg_id}",
                        source=source_file_id,
                        target=pkg_id,
                        label="DEPENDS_ON",
                    )
                )

        # 6. Calculate Graph Statistics
        stats = {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "files_count": len([n for n in nodes if n.type == GraphNodeType.FILE]),
            "routes_count": len([n for n in nodes if n.type == GraphNodeType.ROUTE]),
            "models_count": len([n for n in nodes if n.type == GraphNodeType.MODEL]),
            "classes_count": len([n for n in nodes if n.type == GraphNodeType.CLASS]),
            "external_packages_count": len([n for n in nodes if n.type == GraphNodeType.PACKAGE]),
        }

        return KnowledgeGraphData(nodes=nodes, edges=edges, stats=stats)

    @staticmethod
    def compute_downstream_impact(
        target_file: str,
        graph_data: KnowledgeGraphData,
        target_symbol: str = "",
    ) -> Dict[str, Any]:
        """
        Computes the downstream blast radius using multi-tier Breadth-First-Search
        reverse traversal over the dependency graph.
        Guaranteed to be 100% deterministic graph-derived facts (zero LLM hallucination).
        """
        # Build reverse adjacency list (target -> who depends on target)
        reverse_adj = defaultdict(list)
        for edge in graph_data.edges:
            reverse_adj[edge.target].append(edge.source)

        node_map = {n.id: n for n in graph_data.nodes}

        # Resolve target node id flexibly
        target_file_id = f"file:{target_file}"
        target_node = node_map.get(target_file_id)
        if not target_node:
            # Try exact id match
            if target_file in node_map:
                target_file_id = target_file
                target_node = node_map[target_file]
            else:
                # Try matching by filename ending or label
                clean_target = target_file.split("/")[-1]
                for n in graph_data.nodes:
                    if (n.file_path and n.file_path.endswith(clean_target)) or n.label == clean_target:
                        target_file_id = n.id
                        target_node = n
                        break

        target_label = target_node.label if target_node else target_file.split("/")[-1]

        visited = {target_file_id: 0}
        queue = deque()
        # queue item: (node_id, depth, parent_id, path_so_far)
        queue.append((target_file_id, 0, None, [target_label]))

        direct_dependents = []
        indirect_dependents = []
        affected_routes = []
        affected_models = []
        affected_components = []
        affected_files = []
        caller_chains = []

        seen_routes = set()
        seen_models = set()
        seen_components = set()

        while queue:
            current_id, depth, parent_id, path = queue.popleft()
            node = node_map.get(current_id)

            if node and current_id != target_file_id:
                node_label = node.label
                node_type_str = node.type.value if hasattr(node.type, "value") else str(node.type)
                clean_path = node.file_path or ""

                is_module = node.type in (GraphNodeType.FILE, GraphNodeType.SERVICE, GraphNodeType.PACKAGE)

                if is_module:
                    if depth == 1:
                        direct_dependents.append({
                            "id": node.id,
                            "label": node_label,
                            "type": node_type_str,
                            "file_path": clean_path,
                            "depth": 1,
                        })
                    elif depth >= 2:
                        indirect_dependents.append({
                            "id": node.id,
                            "label": node_label,
                            "type": node_type_str,
                            "file_path": clean_path,
                            "depth": depth,
                            "parent_id": parent_id,
                        })

                # Classify node entities
                if node.type == GraphNodeType.FILE and clean_path and clean_path != target_file:
                    if clean_path not in affected_files:
                        affected_files.append(clean_path)

                if node.type == GraphNodeType.ROUTE or "route" in node.id:
                    route_key = node.data.get("path", node_label)
                    if route_key not in seen_routes:
                        seen_routes.add(route_key)
                        affected_routes.append(node.data or {"path": node_label, "http_method": "ROUTE"})

                if node.type == GraphNodeType.MODEL or "model" in node.id:
                    model_key = node.data.get("model_name", node_label)
                    if model_key not in seen_models:
                        seen_models.add(model_key)
                        affected_models.append(node.data or {"model_name": node_label})

                # Check if UI Component / Controller / View / Service
                is_component = (
                    node.type in (GraphNodeType.CLASS, GraphNodeType.SERVICE)
                    or any(k in node_label for k in ("Component", "Ctrl", "Controller", "View", "Page", "Login", "Profile", "Admin"))
                    or any(k in clean_path for k in ("components/", "views/", "pages/", "controllers/"))
                    or clean_path.endswith((".tsx", ".jsx", ".vue"))
                )
                if is_component and node.id not in seen_components:
                    seen_components.add(node.id)
                    affected_components.append({
                        "id": node.id,
                        "label": node_label,
                        "type": node_type_str,
                        "file_path": clean_path,
                        "depth": depth,
                    })

            # Reverse dependents
            dependents = reverse_adj.get(current_id, [])
            if not dependents and depth > 0:
                caller_chains.append(path)

            for dep_id in dependents:
                if dep_id not in visited:
                    visited[dep_id] = depth + 1
                    dep_node = node_map.get(dep_id)
                    dep_label = dep_node.label if dep_node else dep_id.split(":")[-1]
                    queue.append((dep_id, depth + 1, current_id, path + [dep_label]))

        # Calculate blast radius score (0-100)
        total_files = max(1, graph_data.stats.get("files_count", 1))
        file_pct = (len(affected_files) / total_files) * 100
        score = min(100.0, round(
            file_pct * 1.5 + len(affected_routes) * 10.0 + len(affected_models) * 15.0 + len(direct_dependents) * 5.0,
            1
        ))

        # Risk level assessment
        if score >= 70 or len(affected_routes) >= 5 or len(affected_models) >= 2 or len(direct_dependents) >= 3:
            risk_level = "CRITICAL" if score >= 85 else "HIGH"
        elif score >= 30 or len(affected_routes) >= 2 or len(direct_dependents) >= 1:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        # Generate Visual Tiered Tree Nodes and Edges for ReactFlow
        blast_tree_nodes = []
        blast_tree_edges = []

        # Tier 0: Root node (e.g. User.js)
        blast_tree_nodes.append({
            "id": target_file_id,
            "type": "customNode",
            "position": {"x": 450, "y": 50},
            "data": {
                "label": target_label,
                "tier": 0,
                "role": "root",
                "risk": risk_level,
                "subtext": "Blast Radius Target",
            },
        })

        # Tier 1: Direct dependents (e.g. authService, profileCtrl, adminCtrl)
        d_count = len(direct_dependents)
        d_spacing = 260
        d_start_x = 450 - ((d_count - 1) * d_spacing) / 2 if d_count > 1 else 450

        for idx, d in enumerate(direct_dependents):
            x_pos = d_start_x + (idx * d_spacing)
            blast_tree_nodes.append({
                "id": d["id"],
                "type": "customNode",
                "position": {"x": x_pos, "y": 230},
                "data": {
                    "label": d["label"],
                    "tier": 1,
                    "role": "direct",
                    "file_path": d["file_path"],
                    "subtext": "Direct Dependent",
                },
            })
            blast_tree_edges.append({
                "id": f"blast_edge:{target_file_id}->{d['id']}",
                "source": target_file_id,
                "target": d["id"],
                "label": "IMPACTS",
                "animated": True,
                "style": {"stroke": "#f59e0b", "strokeWidth": 2},
            })

        # Tier 2: Downstream dependents / APIs / Components (e.g. Login, Profile, Admin)
        downstream_items = indirect_dependents[:9]
        # Include affected routes or components if few indirect files
        for r in affected_routes[:4]:
            r_id = f"blast_route:{r.get('path')}"
            if not any(n["id"] == r_id for n in blast_tree_nodes):
                downstream_items.append({
                    "id": r_id,
                    "label": f"{r.get('http_method', 'API')} {r.get('path')}",
                    "type": "route",
                    "file_path": "",
                    "depth": 2,
                    "parent_id": direct_dependents[0]["id"] if direct_dependents else target_file_id,
                })

        ind_count = len(downstream_items)
        ind_spacing = 200
        ind_start_x = 450 - ((ind_count - 1) * ind_spacing) / 2 if ind_count > 1 else 450

        for idx, ind in enumerate(downstream_items):
            x_pos = ind_start_x + (idx * ind_spacing)
            parent = ind.get("parent_id") or (direct_dependents[idx % d_count]["id"] if d_count > 0 else target_file_id)
            blast_tree_nodes.append({
                "id": ind["id"],
                "type": "customNode",
                "position": {"x": x_pos, "y": 420},
                "data": {
                    "label": ind["label"],
                    "tier": 2,
                    "role": "indirect",
                    "file_path": ind.get("file_path", ""),
                    "subtext": f"{'API Endpoint' if ind.get('type') == 'route' else 'Downstream Dependent'}",
                },
            })
            blast_tree_edges.append({
                "id": f"blast_edge:{parent}->{ind['id']}",
                "source": parent,
                "target": ind["id"],
                "label": "PROPAGATES_TO",
                "animated": True,
                "style": {"stroke": "#818cf8", "strokeWidth": 1.5},
            })

        graph_facts = {
            "direct_dependents_count": len(direct_dependents),
            "indirect_dependents_count": len(indirect_dependents),
            "affected_apis_count": len(affected_routes),
            "affected_components_count": len(affected_components),
            "direct_dependents": direct_dependents,
            "indirect_dependents": indirect_dependents,
            "affected_routes": affected_routes,
            "affected_components": affected_components,
            "affected_models": affected_models,
            "affected_files": affected_files,
            "caller_chains": caller_chains[:15],
            "blast_tree_nodes": blast_tree_nodes,
            "blast_tree_edges": blast_tree_edges,
            "is_graph_derived": True,
        }

        return {
            "blast_radius_score": score,
            "risk_level": risk_level,
            "affected_files": affected_files,
            "affected_routes": affected_routes,
            "affected_models": affected_models,
            "total_impacted_nodes": len(visited) - 1,
            "graph_derived_facts": graph_facts,
        }


knowledge_graph_builder = KnowledgeGraphBuilder()
