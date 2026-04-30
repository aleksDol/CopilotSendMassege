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


class StartLoginQrRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    channel_account_id: str = Field(alias="channelAccountId")


class PollLoginQrRequest(BaseModel):
    qr_session_id: str = Field(alias="qrSessionId")


class VerifyPasswordQrRequest(BaseModel):
    qr_session_id: str = Field(alias="qrSessionId")
    password: str


class SendMessageRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    channel_account_id: str = Field(alias="channelAccountId")
    external_conversation_id: str = Field(alias="externalConversationId")
    text: str
    source: str | None = None


class LogoutRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    channel_account_id: str = Field(alias="channelAccountId")


class ResolveChatByLinkRequest(BaseModel):
    company_id: str = Field(alias="companyId")
    channel_account_id: str = Field(alias="channelAccountId")
    link: str


class FetchUserProfileRequest(BaseModel):
    telegram_account_id: str = Field(alias="telegramAccountId")
    telegram_user_id: str | None = Field(default=None, alias="telegramUserId")
    username: str | None = None
