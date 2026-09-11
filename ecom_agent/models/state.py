from typing import Annotated, Any, Literal

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from ecoma_agent.models.conversation import ConversationMemory
from ecoma_agent.models.domain import Filter, ProductDiscoveryInput
from ecoma_agent.tools import TOOL_NAMES


def messages_reducer(left: list[Any], right: list[Any]) -> list[Any]:
    return [*left, *right]


class AgentState(BaseModel):
    messages: Annotated[list[Any], messages_reducer]
    tool_calls: list[dict] = []
    tool_outputs: list[str] = []
    needs_tool: bool = False
    reply: str = ""
    conversation_memory: ConversationMemory = Field(default_factory=ConversationMemory)
    resolved_flow_id: str | None = None
    flow_direction: str = "normal"
    flow_action: str | None = None
    escalation: bool = False
    proposed_intent: str | None = None


class CheckResult(BaseModel):
    needs_tool: bool = Field(default=False, description="Whether the query requires a tool")
    tool_name: str | None = Field(default=None, description="Name of the tool (or proposed intent name) to use if needed")
    reply: str = Field(default="", description="Direct answer if no tool is needed")


class ToolChoice(BaseModel):
    tool: Literal[*TOOL_NAMES] | None = Field(default=None, description="The tool to use for the user's request")
    arguments: dict[str, Any] = Field(default_factory=dict, description="Arguments for the tool")
    proposed_new_tool: str | None = Field(default=None, description="Name of a missing intent/tool the request needs when NONE of the available tools fits")


class AddressFields(BaseModel):
    wilaya: str | None = Field(default=None, description="The wilaya (province) mentioned in the customer message.")
    commune: str | None = Field(default=None, description="The commune (city/town) mentioned in the customer message.")
    address: str | None = Field(default=None, description="The street or detailed delivery address mentioned in the customer message.")


class FlowResolution(BaseModel):
    action: Literal["CONTINUE", "CREATE", "NO_FLOW_LOOKUP", "CLARIFY", "INVALID_ACTION"]
    flow_id: str | None = Field(default=None, description="Flow to apply the tool call on (CONTINUE)")
    reason: str | None = Field(default=None, description="Reason for CLARIFY / INVALID_ACTION")
    product_name: str | None = Field(default=None, description="Product name for CREATE")
    filters: Filter | None = Field(default=None, description="Filters for CREATE")


class DraftRoute(BaseModel):
    decision: Literal["continue_draft", "new_request", "cancel"]
