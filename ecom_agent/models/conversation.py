from pydantic import BaseModel, Field

from ecoma_agent.models.domain import Flow


class GlobalInformation(BaseModel):
    customer_name: str | None = None
    wilaya: str | None = None
    commune: str | None = None
    address: str | None = None


class ConversationMemory(BaseModel):
    global_information: GlobalInformation = Field(default_factory=GlobalInformation)
    flows: list[Flow] = Field(default_factory=list)
    active_flow_id: str | None = None
