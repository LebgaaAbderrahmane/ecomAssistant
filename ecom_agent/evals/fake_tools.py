"""A fake shop that replaces back's ToolService during evals."""
import json
from typing import Any

import tools.registry

OUTCOME_NOT_FOUND = 2

PRODUCTS = [
    {"id": "p1", "name": "Nike Air Max", "price": 12000, "currency": "DZD", "stockStatus": "IN_STOCK"},
    {"id": "p2", "name": "Montre Casio", "price": 4500, "currency": "DZD", "stockStatus": "IN_STOCK"},
    {"id": "p3", "name": "Hoodie Adidas", "price": 6000, "currency": "DZD", "stockStatus": "IN_STOCK"},
]
SHIPPING = {"oran": ("Oran", 600), "alger": ("Alger", 400)}
ORDERS = {"o1": {"orderId": "o1", "status": "PENDING", "productName": "Nike Air Max", "trackingNumber": None}}

calls: list[dict] = []


def reset() -> None:
    calls.clear()


def _not_found(error: str, **data: Any) -> str:
    return json.dumps({"outcome": OUTCOME_NOT_FOUND, "error": error, **data}, ensure_ascii=False)


def _match_products(query: str) -> list[dict]:
    # Word match so "montres" finds "Montre Casio"; short words like "air" are ignored.
    q = query.lower()
    return [p for p in PRODUCTS if any(w in q for w in p["name"].lower().split() if len(w) >= 4)]


def _find_product(entities: dict) -> dict | None:
    pid = str(entities.get("productId") or "")
    name = str(entities.get("productName") or "")
    by_id = next((p for p in PRODUCTS if p["id"] == pid), None)
    if by_id is not None:
        return by_id
    return next(iter(_match_products(name)), None) if name else None


def _order_result(entities: dict, **changes: Any) -> str:
    order = ORDERS.get(str(entities.get("orderId") or ""))
    if order is None:
        return _not_found("Order not found")
    return json.dumps({**order, **changes}, ensure_ascii=False)


def fake_call_tool(tool_name: str, entities: dict) -> str:
    calls.append({"name": tool_name, "args": dict(entities)})
    if tool_name == "searchProducts":
        query = str(entities.get("product") or "")
        found = _match_products(query)
        if not found:
            return _not_found(f'No product matching "{query}" exists in the store\'s catalog.', query=query)
        return json.dumps({"products": found}, ensure_ascii=False)
    if tool_name == "suggestProducts":
        return json.dumps({"products": PRODUCTS, "recommended": True}, ensure_ascii=False)
    if tool_name in ("selectProduct", "getProductDetails"):
        product = _find_product(entities)
        return json.dumps(product, ensure_ascii=False) if product else _not_found("Product not found")
    if tool_name == "calculateShipping":
        hit = SHIPPING.get(str(entities.get("wilaya") or "").strip().lower())
        if hit is None:
            return _not_found("No delivery cost configured for this wilaya")
        return json.dumps({"wilaya": hit[0], "cost": hit[1]}, ensure_ascii=False)
    if tool_name == "createOrder":
        return json.dumps({"orderId": "o-new", "status": "PENDING", **entities}, ensure_ascii=False)
    if tool_name == "getOrderStatus":
        return _order_result(entities)
    if tool_name == "confirmOrder":
        return _order_result(entities, status="CONFIRMED")
    if tool_name == "cancelOrder":
        return _order_result(entities, status="CANCELLED")
    if tool_name == "modifyOrder":
        return _order_result(entities, **{k: v for k, v in entities.items() if k != "orderId"})
    if tool_name == "escalateConversation":
        return json.dumps({"escalated": True, "reason": entities.get("reason", "")}, ensure_ascii=False)
    return _not_found(f"Unknown tool {tool_name}")


def install() -> None:
    tools.registry.call_tool = fake_call_tool
