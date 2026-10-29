"""Products out of back's tool answers."""
import json
import logging

from grpc_gen.tools.v1 import tool_pb2
from models.domain import Product
from tools.registry import searchProducts

logger = logging.getLogger(__name__)


def tool_result_products(content: str) -> list[Product] | None:
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return None
    if isinstance(data, dict):
        unwrapped = None
        for key in ("products", "results"):
            if isinstance(data.get(key), list):
                unwrapped = data[key]
                break
        if unwrapped is not None:
            data = unwrapped
        elif data.get("price") is not None and (
            data.get("product_id") or data.get("productId") or data.get("id")
        ):
            data = [data]
        else:
            return None
    if not isinstance(data, list):
        return None
    products = []
    for item in data:
        pid = item.get("product_id") or item.get("productId") or item.get("id")
        name = item.get("product_name") or item.get("productName") or item.get("name")
        price = item.get("price")
        if not pid or not name or price is None:
            continue
        products.append(Product(product_id=str(pid), product_name=str(name), price=float(price)))
    return products or None


def search_catalog(name: str) -> list[Product] | None:
    """The shop's products for a name, for the order Draft. [] when back found none, None when the search failed."""
    try:
        content = searchProducts.invoke({"product": name})
    except Exception as e:
        logger.warning("catalog search for %r failed (%s)", name, e)
        return None
    found = tool_result_products(content)
    if found:
        return found
    try:
        outcome = json.loads(content).get("outcome")
    except (json.JSONDecodeError, AttributeError):
        return None
    return [] if outcome == tool_pb2.ExecuteToolResponse.OUTCOME_NOT_FOUND else None
