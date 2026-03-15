from pydantic import BaseModel, Field


class StartLoginRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    channel_account_id: str = Field(alias="channelAccountId")
    phone: str


class VerifyCodeRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    phone: str
    code: str


class VerifyPasswordRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    phone: str
    password: str


class SyncRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    channel_account_id: str = Field(alias="channelAccountId")
    phone: str | None = None
    dialogs_limit: int | None = Field(default=None, alias="dialogsLimit")
    messages_per_dialog: int | None = Field(default=None, alias="messagesPerDialog")


class SendMessageRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    channel_account_id: str = Field(alias="channelAccountId")
    external_conversation_id: str = Field(alias="externalConversationId")
    text: str
