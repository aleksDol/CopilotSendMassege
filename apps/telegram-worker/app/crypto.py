import base64
import hashlib

from cryptography.fernet import Fernet


class SessionCrypto:
    def __init__(self, secret: str) -> None:
        digest = hashlib.sha256(secret.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(digest)
        self._fernet = Fernet(key)

    def encrypt(self, value: str) -> str:
        token = self._fernet.encrypt(value.encode("utf-8"))
        return token.decode("utf-8")

    def decrypt(self, token: str) -> str:
        decrypted = self._fernet.decrypt(token.encode("utf-8"))
        return decrypted.decode("utf-8")
